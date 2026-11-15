import http from "node:http";
import { config, missingConfig } from "./config.js";
import { frigate, frigateJson, FrigateError } from "./frigate.js";
import { listCameras, getSnapshot, clampHeight } from "./cameras.js";

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
      return send(res, 404, { error: "Not found" });
    }
    return send(res, 404, { error: "Not found" });
  } catch (e) {
    const err = e as FrigateError;
    const status = err.status === 404 ? 404 : err instanceof FrigateError ? 502 : 500;
    return send(res, status, { error: err.message });
  }
});

server.listen(config.port, () => {
  console.log(`Lookout listening on :${config.port}`);
  console.log(`Frigate: ${config.frigateUrl} (user: ${config.frigateUser || "NOT SET"})`);
});
