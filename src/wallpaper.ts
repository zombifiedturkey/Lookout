import fs from "node:fs";
import path from "node:path";
import type http from "node:http";
import { config } from "./config.js";
import { BadRequest } from "./frigate.js";

// One wallpaper image, kept in the data folder so every device sees the same one.
export const MAX_WALLPAPER_BYTES = 15 * 1024 * 1024;

const TYPES = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" } as const;
type Ext = keyof typeof TYPES;
const EXTS = Object.keys(TYPES) as Ext[];

function dir(): string {
  const d = path.resolve(config.dataDir);
  fs.mkdirSync(d, { recursive: true });
  return d;
}

const fileFor = (ext: Ext) => path.join(dir(), `wallpaper.${ext}`);

// Decide the type from the file's first bytes, not from what the browser claims.
function sniff(b: Buffer): Ext | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (b.length > 12 && b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return "webp";
  return null;
}

function current(): { ext: Ext; file: string; mtimeMs: number; size: number } | null {
  for (const ext of EXTS) {
    const file = fileFor(ext);
    try {
      const st = fs.statSync(file);
      if (st.isFile()) return { ext, file, mtimeMs: st.mtimeMs, size: st.size };
    } catch {
      /* not this one */
    }
  }
  return null;
}

export function wallpaperInfo(): { set: boolean; version: number } {
  const c = current();
  return c ? { set: true, version: Math.floor(c.mtimeMs) } : { set: false, version: 0 };
}

export function saveWallpaper(body: Buffer): { set: boolean; version: number } {
  if (body.length === 0) throw new BadRequest("No image received");
  const ext = sniff(body);
  if (!ext) throw new BadRequest("The wallpaper must be a JPEG, PNG or WebP image");
  const tmp = path.join(dir(), `wallpaper.tmp-${process.pid}`);
  fs.writeFileSync(tmp, body);
  for (const other of EXTS) if (other !== ext) fs.rmSync(fileFor(other), { force: true });
  fs.renameSync(tmp, fileFor(ext));
  return wallpaperInfo();
}

export function deleteWallpaper(): void {
  for (const ext of EXTS) fs.rmSync(fileFor(ext), { force: true });
}

export function serveWallpaper(res: http.ServerResponse): boolean {
  const c = current();
  if (!c) return false;
  res.writeHead(200, {
    "Content-Type": TYPES[c.ext],
    "Content-Length": c.size,
    // The page asks for ?v=<version>, so a new upload is a new URL and old copies can be cached hard.
    "Cache-Control": "private, max-age=31536000, immutable",
  });
  fs.createReadStream(c.file).pipe(res);
  return true;
}
