// Tiny fake Frigate for testing Lookout without a network. Not shipped in the image.
import http from "node:http";
import crypto from "node:crypto";

const PORT = Number(process.env.MOCK_PORT ?? 8971);
const TOKEN = "mocktoken123";
let mockHits = 0;
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9]);
const CLIP = Buffer.alloc(1000, 7); // pretend mp4
const EVENTS = [
  { id: "1731668432.123456-aaa111", camera: "front_door", label: "person", sub_label: null, start_time: 1731668432.1, end_time: 1731668447.9, has_clip: true, has_snapshot: true, data: { top_score: 0.87 } },
  { id: "1731668000.000001-bbb222", camera: "driveway", label: "car", sub_label: null, start_time: 1731668000.0, end_time: null, has_clip: false, has_snapshot: true, top_score: 0.74 },
];

const REVIEWS = [
  { id: "1731668432.1-r1", camera: "front_door", start_time: 1731668432, end_time: 1731668460, severity: "alert", has_been_reviewed: false, thumb_path: "x", data: { detections: ["1731668432.123456-aaa111"], objects: ["person"], zones: [] } },
  { id: "1731668000.0-r2", camera: "driveway", start_time: 1731668000, end_time: null, severity: "detection", has_been_reviewed: true, thumb_path: "x", data: { detections: ["1731668000.000001-bbb222"], objects: ["car"], zones: [] } },
];
let viewedCalls = [];
const authed = (req) => (req.headers.cookie ?? "").includes(`frigate_token=${TOKEN}`);

const server = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const url = req.url ?? "";
    if (url === "/api/login" && req.method === "POST") {
      const b = JSON.parse(Buffer.concat(chunks).toString() || "{}");
      if (b.user === "camui" && b.password === "good") {
        res.writeHead(200, { "Set-Cookie": `frigate_token=${TOKEN}; Path=/; HttpOnly`, "Content-Type": "application/json" });
        return res.end("{}");
      }
      res.writeHead(401);
      return res.end("{}");
    }
    if (url === "/__viewed") { res.writeHead(200); return res.end(JSON.stringify(viewedCalls)); }
    if (url === "/__hits") { res.writeHead(200); return res.end(String(mockHits)); }
    if (!authed(req)) { res.writeHead(401); return res.end(); }

    if (url === "/api/go2rtc/streams") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ driveway: {}, driveway_sub: {}, front_door: {}, front_yard: {}, backyard: {} }));
    }
    if (url === "/api/version") { res.writeHead(200); return res.end("0.18.2-mock"); }
    if (url === "/api/config") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ cameras: { driveway: {}, front_door: {}, front_yard: {}, backyard: {} } }));
    }
    if (/^\/api\/[a-z_]+\/latest\.jpg/.test(url)) {
      mockHits++;
      res.writeHead(200, { "Content-Type": "image/jpeg" });
      return res.end(JPEG);
    }
    if (url.startsWith("/api/review?")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(REVIEWS));
    }
    const rid = url.match(/^\/api\/review\/([^/]+)$/);
    if (rid) {
      const r = REVIEWS.find((x) => x.id === rid[1]);
      if (!r) { res.writeHead(404); return res.end("{}"); }
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(r));
    }
    const rthumb = url.match(/^\/clips\/review\/thumb-([a-z_]+)-(.+)\.webp$/);
    if (rthumb) {
      // only the first review has a saved thumbnail; the second must fall back to its detection's thumbnail
      if (rthumb[2] === "1731668432.1-r1") { res.writeHead(200, { "Content-Type": "image/webp" }); return res.end(JPEG); }
      res.writeHead(404); return res.end();
    }
    if (url === "/api/reviews/viewed" && req.method === "POST") {
      if (req.headers["x-csrf-token"] !== "1") { res.writeHead(401); return res.end("{}"); }
      viewedCalls.push(Buffer.concat(chunks).toString());
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end("{}");
    }
    if (url === "/__viewed") { res.writeHead(200); return res.end(JSON.stringify(viewedCalls)); }
    const rclip = url.match(/^\/api\/([a-z_]+)\/start\/(\d+)\/end\/(\d+)\/clip\.mp4$/);
    if (rclip) {
      res.writeHead(200, { "Content-Type": "video/mp4", "Content-Length": CLIP.length, "X-Mock-Range": `${rclip[1]} ${rclip[2]}-${rclip[3]}` });
      return res.end(CLIP);
    }
    if (url.startsWith("/api/events?")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(EVENTS));
    }
    const ev = url.match(/^\/api\/events\/([^/]+)\/(thumbnail\.jpg|snapshot\.jpg|clip\.mp4)$/);
    if (ev) {
      if (!EVENTS.some((e) => e.id === ev[1])) { res.writeHead(404); return res.end("{}"); }
      if (ev[2] !== "clip.mp4") { res.writeHead(200, { "Content-Type": "image/jpeg" }); return res.end(JPEG); }
      const m = (req.headers.range ?? "").match(/bytes=(\d+)-(\d*)/);
      if (m) {
        const start = Number(m[1]);
        const end = m[2] ? Number(m[2]) : CLIP.length - 1;
        res.writeHead(206, { "Content-Type": "video/mp4", "Content-Range": `bytes ${start}-${end}/${CLIP.length}`, "Content-Length": end - start + 1, "Accept-Ranges": "bytes" });
        return res.end(CLIP.subarray(start, end + 1));
      }
      res.writeHead(200, { "Content-Type": "video/mp4", "Content-Length": CLIP.length, "Accept-Ranges": "bytes" });
      return res.end(CLIP);
    }
    res.writeHead(404);
    res.end();
  });
});

// Minimal WebSocket endpoint at /live/mse/api/ws?src=NAME : sends two frames, echoes what the client sends.
function frame(opcode, payload) {
  return Buffer.concat([Buffer.from([0x80 | opcode, payload.length]), payload]);
}
server.on("upgrade", (req, socket) => {
  if (!authed(req) || !String(req.url).startsWith("/live/mse/api/ws?src=")) {
    socket.write("HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\n\r\n");
    return socket.destroy();
  }
  const accept = crypto.createHash("sha1").update(req.headers["sec-websocket-key"] + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  const src = new URL(req.url, "http://x").searchParams.get("src");
  socket.write(frame(1, Buffer.from(JSON.stringify({ type: "mse", value: "video/mp4", src }))));
  socket.write(frame(2, Buffer.from([1, 2, 3, 4])));
  socket.on("data", (buf) => {
    // client frames are masked: 2 header bytes, 4 mask bytes, payload (short messages only)
    if ((buf[0] & 0x0f) === 8) return socket.end();
    const len = buf[1] & 0x7f;
    const mask = buf.subarray(2, 6);
    const payload = Buffer.from(buf.subarray(6, 6 + len).map((b, i) => b ^ mask[i % 4]));
    socket.write(frame(1, Buffer.from("echo:" + payload.toString())));
  });
  socket.on("error", () => {});
});

server.listen(PORT, () => console.log(`Mock Frigate on :${PORT}`));
