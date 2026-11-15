import http from "node:http";
import { frigate, FrigateError } from "./frigate.js";

// Frigate builds clips on demand and may not support seeking (HTTP Range). Clips are short, so Lookout fetches the
// whole clip once, keeps it in memory for a few minutes, and serves it with proper Range support so the player can
// scrub freely.
interface Cached {
  at: number;
  type: string;
  body: Buffer;
}

const TTL_MS = 10 * 60_000;
const MAX_BYTES = 150 * 1024 * 1024;
const cache = new Map<string, Cached>();
const inflight = new Map<string, Promise<Cached>>();

function evict() {
  const now = Date.now();
  let total = 0;
  for (const [k, v] of cache) {
    if (now - v.at > TTL_MS) cache.delete(k);
    else total += v.body.length;
  }
  // oldest first (Map keeps insertion order)
  for (const [k, v] of cache) {
    if (total <= MAX_BYTES) break;
    cache.delete(k);
    total -= v.body.length;
  }
}

export async function getClip(path: string): Promise<Cached> {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < TTL_MS) return hit;
  const pending = inflight.get(path);
  if (pending) return pending;
  const p = (async () => {
    const res = await frigate(path, { timeoutMs: 120_000 });
    if (res.status !== 200) throw new FrigateError(`Frigate returned HTTP ${res.status} for the clip`, res.status);
    const clip: Cached = { at: Date.now(), type: String(res.headers["content-type"] ?? "video/mp4"), body: res.body };
    cache.set(path, clip);
    evict();
    return clip;
  })().finally(() => inflight.delete(path));
  inflight.set(path, p);
  return p;
}

export async function serveClip(path: string, rangeHeader: string | undefined, res: http.ServerResponse): Promise<void> {
  const clip = await getClip(path);
  const size = clip.body.length;
  const base = { "Content-Type": clip.type, "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=60" };

  const m = rangeHeader?.match(/^bytes=(\d*)-(\d*)$/);
  if (!m || (m[1] === "" && m[2] === "")) {
    res.writeHead(200, { ...base, "Content-Length": size });
    res.end(clip.body);
    return;
  }
  let start: number;
  let end: number;
  if (m[1] === "") {
    // suffix range: the last N bytes
    start = Math.max(0, size - Number(m[2]));
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start >= size || start > end) {
    res.writeHead(416, { ...base, "Content-Range": `bytes */${size}` });
    res.end();
    return;
  }
  res.writeHead(206, { ...base, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": end - start + 1 });
  res.end(clip.body.subarray(start, end + 1));
}
