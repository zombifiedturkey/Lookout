import { frigateJson } from "./frigate.js";
import { listCameras } from "./cameras.js";

interface FrigateEvent {
  id: string;
  camera: string;
  label: string;
  sub_label?: string | null;
  start_time: number;
  end_time: number | null;
  has_clip?: boolean;
  has_snapshot?: boolean;
  top_score?: number | null;
  data?: { top_score?: number; score?: number } | null;
  zones?: string[];
}

export interface EventInfo {
  id: string;
  camera: string;
  cameraLabel: string;
  label: string;
  subLabel: string | null;
  startTime: number; // unix seconds
  endTime: number | null; // null while still in progress
  hasClip: boolean;
  hasSnapshot: boolean;
  score: number | null; // 0-100
}

export async function listEvents(limit: number, camera?: string): Promise<EventInfo[]> {
  const params = new URLSearchParams({ limit: String(limit), include_thumbnails: "0" });
  if (camera) params.set("camera", camera);
  const [raw, cams] = await Promise.all([frigateJson<FrigateEvent[]>(`/api/events?${params}`), listCameras()]);
  const labels = new Map(cams.map((c) => [c.name, c.label]));
  return raw.map((e) => {
    const s = e.data?.top_score ?? e.top_score ?? e.data?.score ?? null;
    return {
      id: e.id,
      camera: e.camera,
      cameraLabel: labels.get(e.camera) ?? e.camera,
      label: e.label,
      subLabel: e.sub_label ?? null,
      startTime: e.start_time,
      endTime: e.end_time ?? null,
      hasClip: e.has_clip ?? false,
      hasSnapshot: e.has_snapshot ?? false,
      score: s === null ? null : Math.round(s * 100),
    };
  });
}

export function clampLimit(raw: string | null): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 60;
  return Math.min(200, Math.max(1, Math.round(n)));
}
