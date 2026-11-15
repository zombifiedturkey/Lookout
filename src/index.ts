import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { config, missingConfig } from "./config.js";
import { frigate, frigateJson, frigateStream, frigateUpgrade, FrigateError } from "./frigate.js";
import { listCameras, getSnapshot, clampHeight, liveStreamName } from "./cameras.js";
import { listEvents, clampLimit } from "./events.js";
import { listReview, clampHours, reviewThumbnail, reviewClipPath, markViewed } from "./review.js";

function send(res: http.ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(payload);
}

// Login: the password is LOOKOUT_TOKEN. A correct login sets a cookie that browsers send automatically
// (including for images, video and WebSockets), so nothing secret needs to sit in the address bar.
// Apps (the Shield) can still send "Authorization: Bearer <password>".
const SESSION_COOKIE = "lookout_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 365;

function sessionValue(): string {
  return crypto.createHmac("sha256", config.token).update("lookout-session-v1").digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function cookieValue(req: http.IncomingMessage, name: string): string {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return "";
}

function authorised(req: http.IncomingMessage, url: URL): boolean {
  if (!config.token) return true;
  const header = req.headers.authorization ?? "";
  if (safeEqual(header, `Bearer ${config.token}`)) return true;
  const q = url.searchParams.get("token");
  if (q && safeEqual(q, config.token)) return true;
  const c = cookieValue(req, SESSION_COOKIE);
  return c !== "" && safeEqual(c, sessionValue());
}

// After 5 wrong passwords from one address, refuse further tries for a minute.
const failures = new Map<string, { count: number; until: number }>();

function readBody(req: http.IncomingMessage, limit = 4096): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        reject(new Error("Body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function handleLogin(req: http.IncomingMessage, res: http.ServerResponse) {
  const ip = req.socket.remoteAddress ?? "unknown";
  const f = failures.get(ip);
  if (f && f.until > Date.now()) return send(res, 429, { error: "Too many attempts. Wait a minute and try again." });

  let password = "";
  try {
    password = String((JSON.parse(await readBody(req)) as { password?: unknown }).password ?? "");
  } catch {
    return send(res, 400, { error: "Bad request" });
  }
  if (!config.token || safeEqual(password, config.token)) {
    failures.delete(ip);
    res.setHeader("Set-Cookie", `${SESSION_COOKIE}=${config.token ? sessionValue() : "open"}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}`);
    return send(res, 200, { ok: true });
  }
  const count = (f?.count ?? 0) + 1;
  failures.set(ip, { count, until: count >= 5 ? Date.now() + 60_000 : 0 });
  if (count >= 5) failures.set(ip, { count: 0, until: Date.now() + 60_000 });
  return send(res, 401, { error: "Wrong password" });
}

async function health() {
  const missing = missingConfig();
  if (missing.length) {
    return { status: 500, body: { ok: false, error: `Missing settings: ${missing.join(", ")}` } };
  }
  try {
    const versionRes = await frigate("/api/version");
    const cfg = await frigateJson<{ cameras?: Record<string, unknown> }>("/api/config");
    return {
      status: 200,
      body: {
        ok: true,
        frigateUrl: config.frigateUrl,
        frigateVersion: versionRes.status === 200 ? versionRes.body.toString("utf8").trim() : null,
        cameras: Object.keys(cfg.cameras ?? {}),
      },
    };
  } catch (e) {
    const err = e as FrigateError;
    return { status: 502, body: { ok: false, error: err.message, frigateStatus: err.status ?? null } };
  }
}

const CAMERA_NAME = /^[A-Za-z0-9_-]+$/;
// Frigate event ids look like 1731668432.123456-ab12cd
const EVENT_ID = /^[A-Za-z0-9._-]+$/;

async function sendFrigateImage(res: http.ServerResponse, path: string, cacheSeconds: number) {
  const r = await frigate(path);
  if (r.status !== 200) {
    return send(res, r.status === 404 ? 404 : 502, { error: `Frigate returned HTTP ${r.status}` });
  }
  res.writeHead(200, {
    "Content-Type": String(r.headers["content-type"] ?? "image/jpeg"),
    "Content-Length": r.body.length,
    "Cache-Control": `private, max-age=${cacheSeconds}`,
  });
  res.end(r.body);
}

// The built web UI (web/dist) is copied to ./public in the Docker image. Not present in dev, where Vite serves it.
const PUBLIC_DIR = path.resolve(process.env.PUBLIC_DIR ?? "public");
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".json": "application/json", ".webmanifest": "application/manifest+json",
};

function serveStatic(req: http.IncomingMessage, res: http.ServerResponse, pathname: string): boolean {
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  if (!fs.existsSync(PUBLIC_DIR)) return false;
  let rel: string;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    return false;
  }
  let file = path.resolve(PUBLIC_DIR, "." + path.sep + rel);
  if (file !== PUBLIC_DIR && !file.startsWith(PUBLIC_DIR + path.sep)) return false; // no escaping the folder
  let isIndex = false;
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(PUBLIC_DIR, "index.html"); // single-page app fallback
    isIndex = true;
    if (!fs.existsSync(file)) return false;
  }
  const body = fs.readFileSync(file);
  res.writeHead(200, {
    "Content-Type": MIME[path.extname(file)] ?? "application/octet-stream",
    "Content-Length": body.length,
    // hashed asset files can be cached hard; index.html must always be re-checked
    "Cache-Control": isIndex || file.endsWith("index.html") ? "no-cache" : "public, max-age=31536000, immutable",
  });
  res.end(req.method === "HEAD" ? undefined : body);
  return true;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  try {
    if (url.pathname === "/health") {
      const h = await health();
      return send(res, h.status, h.body);
    }
    if (url.pathname === "/api/login" && req.method === "POST") return await handleLogin(req, res);
    if (url.pathname === "/api/logout" && req.method === "POST") {
      res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
      return send(res, 200, { ok: true });
    }
    if (url.pathname.startsWith("/api/")) {
      if (!authorised(req, url)) return send(res, 401, { error: "Unauthorised" });

      if (url.pathname === "/api/session") return send(res, 200, { ok: true, loginRequired: Boolean(config.token) });

      if (url.pathname === "/api/cameras") {
        return send(res, 200, { cameras: await listCameras() });
      }

      const snap = url.pathname.match(/^\/api\/cameras\/([A-Za-z0-9_-]+)\/snapshot\.jpg$/);
      if (snap) {
        const s = await getSnapshot(snap[1], clampHeight(url.searchParams.get("h")));
        res.writeHead(200, {
          "Content-Type": s.type,
          "Content-Length": s.body.length,
          "Cache-Control": "no-cache",
          "X-Snapshot-Age-Ms": String(Date.now() - s.at),
        });
        return res.end(s.body);
      }

      if (url.pathname === "/api/events") {
        const camera = url.searchParams.get("camera");
        if (camera && !CAMERA_NAME.test(camera)) return send(res, 400, { error: "Bad camera name" });
        const events = await listEvents(clampLimit(url.searchParams.get("limit")), camera ?? undefined);
        return send(res, 200, { events });
      }

      const ev = url.pathname.match(/^\/api\/events\/([A-Za-z0-9._-]+)\/(thumbnail\.jpg|snapshot\.jpg|clip\.mp4)$/);
      if (ev && EVENT_ID.test(ev[1])) {
        const id = encodeURIComponent(ev[1]);
        if (ev[2] === "clip.mp4") {
          return await frigateStream(`/api/events/${id}/clip.mp4`, req.headers.range, res);
        }
        return await sendFrigateImage(res, `/api/events/${id}/${ev[2]}`, 3600);
      }

      if (url.pathname === "/api/review" && req.method === "GET") {
        return send(res, 200, { items: await listReview(clampHours(url.searchParams.get("hours"))) });
      }

      const rv = url.pathname.match(/^\/api\/review\/([A-Za-z0-9._-]+)\/(thumbnail\.jpg|clip\.mp4|viewed)$/);
      if (rv) {
        if (rv[2] === "viewed") {
          if (req.method !== "POST") return send(res, 405, { error: "Use POST" });
          await markViewed(rv[1]);
          return send(res, 200, { ok: true });
        }
        if (rv[2] === "clip.mp4") {
          return await frigateStream(await reviewClipPath(rv[1]), req.headers.range, res);
        }
        const t = await reviewThumbnail(rv[1]);
        if (!t) return send(res, 404, { error: "No thumbnail for this item" });
        res.writeHead(200, { "Content-Type": t.type, "Content-Length": t.body.length, "Cache-Control": "private, max-age=3600" });
        return res.end(t.body);
      }

      return send(res, 404, { error: "Not found" });
    }
    if (serveStatic(req, res, url.pathname)) return;
    return send(res, 404, { error: "Not found" });
  } catch (e) {
    const err = e as FrigateError;
    const status = err.status === 404 ? 404 : err instanceof FrigateError ? 502 : 500;
    if (res.headersSent) return res.destroy();
    return send(res, status, { error: err.message });
  }
});

// Live video: the browser opens a WebSocket to Lookout, and Lookout tunnels it to Frigate's
// live stream using its own login. Nothing in the browser ever sees Frigate credentials.
server.on("upgrade", async (req, socket, head) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const reject = (code: number, text: string) => {
    socket.write(`HTTP/1.1 ${code} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    socket.destroy();
  };
  const live = url.pathname.match(/^\/api\/cameras\/([A-Za-z0-9_-]+)\/live$/);
  if (!live) return reject(404, "Not Found");
  if (!authorised(req, url)) return reject(401, "Unauthorized");
  try {
    const known = await listCameras();
    if (!known.some((c) => c.name === live[1])) return reject(404, "Not Found");

    const stream = await liveStreamName(live[1], url.searchParams.get("quality"));
    const up = await frigateUpgrade(`/live/mse/api/ws?src=${encodeURIComponent(stream)}`, req.headers);
    let reply = "HTTP/1.1 101 Switching Protocols\r\n";
    for (let i = 0; i < up.response.rawHeaders.length; i += 2) {
      reply += `${up.response.rawHeaders[i]}: ${up.response.rawHeaders[i + 1]}\r\n`;
    }
    socket.write(reply + "\r\n");
    if (up.head.length) socket.write(up.head);
    if (head.length) up.socket.write(head);

    socket.pipe(up.socket);
    up.socket.pipe(socket);
    const close = () => {
      socket.destroy();
      up.socket.destroy();
    };
    socket.on("error", close);
    up.socket.on("error", close);
    socket.on("close", close);
    up.socket.on("close", close);
  } catch {
    reject(502, "Bad Gateway");
  }
});

server.listen(config.port, () => {
  console.log(`Lookout listening on :${config.port}`);
  console.log(`Frigate: ${config.frigateUrl} (user: ${config.frigateUser || "NOT SET"})`);
});
