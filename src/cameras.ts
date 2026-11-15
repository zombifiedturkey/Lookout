import { frigate, frigateJson, FrigateError } from "./frigate.js";

export interface CameraInfo {
  name: string;
  label: string;
}

const CAMERA_LIST_TTL_MS = 60_000;
const SNAPSHOT_TTL_MS = 1_000;

let cameraCache: { at: number; list: CameraInfo[] } | null = null;

// "front_door" -> "Front Door"
function pretty(name: string): string {
  return name
    .split(/[_-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export async function listCameras(): Promise<CameraInfo[]> {
  if (cameraCache && Date.now() - cameraCache.at < CAMERA_LIST_TTL_MS) return cameraCache.list;
  const cfg = await frigateJson<{ cameras?: Record<string, unknown> }>("/api/config");
  const list = Object.keys(cfg.cameras ?? {}).map((name) => ({ name, label: pretty(name) }));
  cameraCache = { at: Date.now(), list };
  return list;
}

interface Snapshot {
  at: number;
  type: string;
  body: Buffer;
}

const snapshotCache = new Map<string, Snapshot>();
const inflight = new Map<string, Promise<Snapshot>>();

// Many clients (grid, widget, TV) can ask at once. One request to Frigate serves
// them all for SNAPSHOT_TTL_MS, so Frigate and the cameras are not hammered.
export async function getSnapshot(name: string, height: number): Promise<Snapshot> {
  const known = await listCameras();
  if (!known.some((c) => c.name === name)) throw new FrigateError("Unknown camera", 404);

  const key = `${name}@${height}`;
  const cached = snapshotCache.get(key);
  if (cached && Date.now() - cached.at < SNAPSHOT_TTL_MS) return cached;

  const pending = inflight.get(key);
  if (pending) return pending;

  const p = (async () => {
    const res = await frigate(`/api/${encodeURIComponent(name)}/latest.jpg?h=${height}`);
    if (res.status !== 200) throw new FrigateError(`Frigate returned HTTP ${res.status} for the snapshot`, res.status);
    const snap: Snapshot = {
      at: Date.now(),
      type: String(res.headers["content-type"] ?? "image/jpeg"),
      body: res.body,
    };
    snapshotCache.set(key, snap);
    return snap;
  })().finally(() => inflight.delete(key));

  inflight.set(key, p);
  return p;
}

export function clampHeight(raw: string | null): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 480;
  return Math.min(1080, Math.max(120, Math.round(n)));
}

// Live streams known to Frigate's built-in go2rtc. The grid asks for "sub" (lower resolution, lighter on
// the browser); we use "<camera>_sub" when it exists and quietly fall back to the main stream when it does not.
let streamCache: { at: number; names: Set<string> } | null = null;

async function go2rtcStreams(): Promise<Set<string>> {
  if (streamCache && Date.now() - streamCache.at < CAMERA_LIST_TTL_MS) return streamCache.names;
  try {
    const data = await frigateJson<Record<string, unknown>>("/api/go2rtc/streams");
    streamCache = { at: Date.now(), names: new Set(Object.keys(data)) };
  } catch {
    streamCache = { at: Date.now(), names: new Set() };
  }
  return streamCache.names;
}

export async function liveStreamName(camera: string, quality: string | null): Promise<string> {
  if (quality !== "sub") return camera;
  const names = await go2rtcStreams();
  return names.has(`${camera}_sub`) ? `${camera}_sub` : camera;
}
