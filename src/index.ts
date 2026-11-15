import http from "node:http";
import { config, missingConfig } from "./config.js";
import { frigate, frigateJson, frigateStream, frigateUpgrade, FrigateError } from "./frigate.js";
import { listCameras, getSnapshot, clampHeight } from "./cameras.js";
import { listEvents, clampLimit } from "./events.js";

function send(res: http.ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(payload);
}

function authorised(req: http.IncomingMessage, url: URL): boolean {
  if (!config.token) return true;
  const header = req.headers.authorization ?? "";
  return header === `Bearer ${config.token}` || url.searchParams.get("token") === config.token;
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

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  try {
    if (url.pathname === "/health") {
      const h = await health();
      return send(res, h.status, h.body);
    }
    if (url.pathname.startsWith("/api/")) {
      if (!authorised(req, url)) return send(res, 401, { error: "Unauthorised" });

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

      return send(res, 404, { error: "Not found" });
    }
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

    const up = await frigateUpgrade(`/live/mse/api/ws?src=${encodeURIComponent(live[1])}`, req.headers);
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
