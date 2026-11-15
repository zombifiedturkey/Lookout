// Tiny fake Frigate for testing Lookout without a network. Not shipped in the image.
import http from "node:http";
const PORT = Number(process.env.MOCK_PORT ?? 8971);
const TOKEN = "mocktoken123";
let mockHits = 0;
http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    if (req.url === "/api/login" && req.method === "POST") {
      const b = JSON.parse(Buffer.concat(chunks).toString() || "{}");
      if (b.user === "camui" && b.password === "good") {
        res.writeHead(200, { "Set-Cookie": `frigate_token=${TOKEN}; Path=/; HttpOnly`, "Content-Type": "application/json" });
        return res.end("{}");
      }
      res.writeHead(401); return res.end("{}");
    }
    if (req.url === "/__hits") { res.writeHead(200); return res.end(String(mockHits)); }
    if (!(req.headers.cookie ?? "").includes(`frigate_token=${TOKEN}`)) { res.writeHead(401); return res.end(); }
    if (req.url === "/api/version") { res.writeHead(200); return res.end("0.18.2-mock"); }
    if (req.url === "/api/config") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ cameras: { driveway: {}, front_door: {}, front_yard: {}, backyard: {} } }));
    }
    const lj = req.url.match(/^\/api\/([a-z_]+)\/latest\.jpg/);
    if (lj) {
      mockHits++;
      res.writeHead(200, { "Content-Type": "image/jpeg" });
      return res.end(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9]));
    }
    if (req.url === "/__hits") { res.writeHead(200); return res.end(String(mockHits)); }
    res.writeHead(404); res.end();
  });
}).listen(PORT, () => console.log(`Mock Frigate on :${PORT}`));
