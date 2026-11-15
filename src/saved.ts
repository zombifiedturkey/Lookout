import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import http from "node:http";
import { spawn } from "node:child_process";
import { config } from "./config.js";
import { BadRequest } from "./frigate.js";
import { getClip } from "./clips.js";
import { reviewClipPath } from "./review.js";

// Saved clips: the part of a Review/Event clip you trimmed, kept by Lookout (not Frigate), so it survives
// Frigate's retention. Each clip is <id>.mp4 + <id>.jpg + <id>.json in the data folder.
export interface SavedInfo {
  id: string;
  name: string;
  camera: string;
  cameraLabel: string;
  label: string;
  recordedAt: number; // unix seconds, when the saved part starts
  duration: number; // seconds
  createdAt: number; // unix seconds
  size: number; // bytes
}

const ID = /^[a-z0-9-]+$/;
const dir = () => path.resolve(config.dataDir, "saved");

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(config.ffmpegPath, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    child.stderr.on("data", (d: Buffer) => {
      err = (err + d.toString()).slice(-1500);
    });
    const timer = setTimeout(() => child.kill("SIGKILL"), 180_000);
    child.on("error", (e: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      reject(new Error(e.code === "ENOENT" ? "ffmpeg is not installed here, so clips cannot be trimmed" : `ffmpeg failed to start: ${e.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg could not trim the clip${err ? `: ${err.trim().split("\n").pop()}` : ""}`));
    });
  });
}

function text(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export interface SaveRequest {
  kind: string;
  id: string;
  start: number;
  end: number;
  name?: unknown;
  camera?: unknown;
  cameraLabel?: unknown;
  label?: unknown;
  recordedAt?: unknown;
}

export async function createSaved(req: SaveRequest): Promise<SavedInfo> {
  const { kind, id, start, end } = req;
  if (kind !== "review" && kind !== "event") throw new BadRequest("Unknown clip type");
  if (typeof id !== "string" || !/^[A-Za-z0-9._-]+$/.test(id)) throw new BadRequest("Bad clip id");
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end - start < 0.3) throw new BadRequest("Choose a start and end at least 0.3 seconds apart");
  if (end - start > 600) throw new BadRequest("Saved clips can be at most 10 minutes");

  const sourcePath = kind === "review" ? await reviewClipPath(id) : `/api/events/${encodeURIComponent(id)}/clip.mp4`;
  const clip = await getClip(sourcePath);

  const dur = Math.round((end - start) * 100) / 100;
  const savedId = `${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`;
  const out = path.join(dir(), `${savedId}.mp4`);
  const thumb = path.join(dir(), `${savedId}.jpg`);
  const tmpIn = path.join(os.tmpdir(), `lookout-${savedId}.mp4`);

  fs.mkdirSync(dir(), { recursive: true });
  fs.writeFileSync(tmpIn, clip.body);
  try {
    // Re-encode so the cut is frame-accurate (a plain copy can only cut on keyframes).
    await runFfmpeg([
      "-y", "-v", "error", "-i", tmpIn, "-ss", String(start), "-t", String(dur),
      "-map", "0:v:0", "-map", "0:a:0?",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-movflags", "+faststart", out,
    ]);
    await runFfmpeg(["-y", "-v", "error", "-ss", String(dur / 2), "-i", out, "-frames:v", "1", "-vf", "scale=640:-2", thumb]);
  } catch (e) {
    fs.rmSync(out, { force: true });
    fs.rmSync(thumb, { force: true });
    throw e;
  } finally {
    fs.rmSync(tmpIn, { force: true });
  }

  const recorded = Number(req.recordedAt);
  const info: SavedInfo = {
    id: savedId,
    name: text(req.name, 120) || "Saved clip",
    camera: text(req.camera, 60),
    cameraLabel: text(req.cameraLabel, 60),
    label: text(req.label, 60),
    recordedAt: Number.isFinite(recorded) ? recorded + start : Math.floor(Date.now() / 1000),
    duration: dur,
    createdAt: Math.floor(Date.now() / 1000),
    size: fs.statSync(out).size,
  };
  fs.writeFileSync(path.join(dir(), `${savedId}.json`), JSON.stringify(info));
  return info;
}

export function listSaved(): SavedInfo[] {
  if (!fs.existsSync(dir())) return [];
  const items: SavedInfo[] = [];
  for (const f of fs.readdirSync(dir())) {
    if (!f.endsWith(".json")) continue;
    try {
      const info = JSON.parse(fs.readFileSync(path.join(dir(), f), "utf8")) as SavedInfo;
      const mp4 = path.join(dir(), `${info.id}.mp4`);
      if (fs.existsSync(mp4)) items.push({ ...info, size: fs.statSync(mp4).size });
    } catch {
      /* skip unreadable entries */
    }
  }
  return items.sort((a, b) => b.createdAt - a.createdAt);
}

export function savedInfo(id: string): SavedInfo | null {
  if (!ID.test(id)) return null;
  try {
    return JSON.parse(fs.readFileSync(path.join(dir(), `${id}.json`), "utf8")) as SavedInfo;
  } catch {
    return null;
  }
}

export function deleteSaved(id: string): boolean {
  if (!ID.test(id) || !fs.existsSync(path.join(dir(), `${id}.json`))) return false;
  for (const ext of ["mp4", "jpg", "json"]) fs.rmSync(path.join(dir(), `${id}.${ext}`), { force: true });
  return true;
}

// Serves a saved file from disk, with Range support so the player can seek.
export function serveSavedFile(
  id: string,
  kind: "clip" | "thumbnail",
  rangeHeader: string | undefined,
  res: http.ServerResponse,
  download: boolean,
): boolean {
  const info = savedInfo(id);
  if (!info) return false;
  const file = path.join(dir(), `${id}.${kind === "clip" ? "mp4" : "jpg"}`);
  if (!fs.existsSync(file)) return false;
  const size = fs.statSync(file).size;
  const headers: Record<string, string | number> = {
    "Content-Type": kind === "clip" ? "video/mp4" : "image/jpeg",
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
  };
  if (download && kind === "clip") {
    const safe = info.name.replace(/[^A-Za-z0-9 ._-]+/g, "").trim() || "clip";
    headers["Content-Disposition"] = `attachment; filename="${safe}.mp4"`;
  }
  const m = rangeHeader?.match(/^bytes=(\d*)-(\d*)$/);
  let start = 0;
  let end = size - 1;
  let status = 200;
  if (m && (m[1] !== "" || m[2] !== "")) {
    if (m[1] === "") start = Math.max(0, size - Number(m[2]));
    else {
      start = Number(m[1]);
      end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
    }
    if (start >= size || start > end) {
      res.writeHead(416, { ...headers, "Content-Range": `bytes */${size}` });
      res.end();
      return true;
    }
    status = 206;
    headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
  }
  headers["Content-Length"] = end - start + 1;
  res.writeHead(status, headers);
  fs.createReadStream(file, { start, end }).pipe(res);
  res.on("close", () => res.destroy());
  return true;
}
