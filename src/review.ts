import { frigate, frigateJson, FrigateError } from "./frigate.js";
import { listCameras } from "./cameras.js";

interface FrigateReview {
  id: string;
  camera: string;
  start_time: number;
  end_time: number | null;
  severity: string;
  has_been_reviewed?: boolean;
  thumb_path?: string;
  data?: { detections?: string[]; objects?: string[]; zones?: string[]; sub_labels?: string[] } | null;
}

export interface ReviewInfo {
  id: string;
  camera: string;
  cameraLabel: string;
  severity: "alert" | "detection";
  startTime: number; // unix seconds
  endTime: number | null; // null while still in progress
  reviewed: boolean;
  objects: string[];
  zones: string[];
  detectionIds: string[];
}

// Remember recently listed items so thumbnail/clip/viewed routes do not need another lookup.
const known = new Map<string, FrigateReview>();

function remember(items: FrigateReview[]) {
  if (known.size > 3000) known.clear();
  for (const r of items) known.set(r.id, r);
}

function toInfo(r: FrigateReview, labels: Map<string, string>): ReviewInfo {
  return {
    id: r.id,
    camera: r.camera,
    cameraLabel: labels.get(r.camera) ?? r.camera,
    severity: r.severity === "alert" ? "alert" : "detection",
    startTime: r.start_time,
    endTime: r.end_time ?? null,
    reviewed: r.has_been_reviewed ?? false,
    objects: r.data?.objects ?? [],
    zones: r.data?.zones ?? [],
    detectionIds: r.data?.detections ?? [],
  };
}

export async function listReview(hours: number): Promise<ReviewInfo[]> {
  const now = Math.floor(Date.now() / 1000);
  const params = new URLSearchParams({
    cameras: "all",
    labels: "all",
    zones: "all",
    reviewed: "1", // include reviewed items; the UI decides whether to show them
    limit: "500",
    after: String(now - hours * 3600),
    before: String(now + 60),
  });
  const [raw, cams] = await Promise.all([frigateJson<FrigateReview[]>(`/api/review?${params}`), listCameras()]);
  remember(raw);
  const labels = new Map(cams.map((c) => [c.name, c.label]));
  return raw
    .filter((r) => r.severity === "alert" || r.severity === "detection")
    .map((r) => toInfo(r, labels))
    .sort((a, b) => b.startTime - a.startTime);
}

export async function getReview(id: string): Promise<FrigateReview> {
  const hit = known.get(id);
  if (hit) return hit;
  const r = await frigateJson<FrigateReview>(`/api/review/${encodeURIComponent(id)}`);
  remember([r]);
  return r;
}

export function clampHours(raw: string | null): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 24;
  return Math.min(24 * 14, Math.max(1, Math.round(n)));
}

// Best-effort: the review thumbnail Frigate saved, otherwise the thumbnail of the first detection inside it.
export async function reviewThumbnail(id: string): Promise<{ type: string; body: Buffer } | null> {
  const r = await getReview(id);
  const direct = await frigate(`/clips/review/thumb-${encodeURIComponent(r.camera)}-${encodeURIComponent(r.id)}.webp`);
  if (direct.status === 200) return { type: String(direct.headers["content-type"] ?? "image/webp"), body: direct.body };
  for (const d of r.data?.detections ?? []) {
    const t = await frigate(`/api/events/${encodeURIComponent(d)}/thumbnail.jpg`);
    if (t.status === 200) return { type: String(t.headers["content-type"] ?? "image/jpeg"), body: t.body };
  }
  return null;
}

// Path of the video clip covering a review item.
export async function reviewClipPath(id: string): Promise<string> {
  const r = await getReview(id);
  const start = Math.floor(r.start_time);
  const end = Math.ceil(r.end_time ?? Date.now() / 1000);
  return `/api/${encodeURIComponent(r.camera)}/start/${start}/end/${Math.max(end, start + 1)}/clip.mp4`;
}

// Frigate has changed how "viewed" is recorded between versions, so try the newer call first, then the older one.
export async function markViewed(id: string): Promise<void> {
  await getReview(id); // makes sure the id exists
  const body = JSON.stringify({ ids: [id] });
  const res = await frigate("/api/reviews/viewed", { method: "POST", body, headers: { "Content-Type": "application/json" } });
  if (res.status >= 200 && res.status < 300) {
    const r = known.get(id);
    if (r) r.has_been_reviewed = true;
    return;
  }
  const old = await frigate(`/api/review/${encodeURIComponent(id)}/viewed`);
  if (old.status < 200 || old.status >= 300) {
    throw new FrigateError(`Frigate would not mark the item as viewed (HTTP ${res.status}/${old.status})`, 502);
  }
  const r = known.get(id);
  if (r) r.has_been_reviewed = true;
}
