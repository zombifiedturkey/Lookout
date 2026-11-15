import http from "node:http";
import https from "node:https";
import type { Socket } from "node:net";
import { config } from "./config.js";

export interface FrigateResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
}

export class FrigateError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

// Plain node http/https is used (not fetch) so the self-signed certificate
// can be accepted for Frigate only, instead of disabling TLS checks globally.
function rawRequest(
  path: string,
  opts: { method?: string; headers?: Record<string, string>; body?: string; timeoutMs?: number } = {},
): Promise<FrigateResponse> {
  const url = new URL(config.frigateUrl + path);
  const isHttps = url.protocol === "https:";
  const lib = isHttps ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.request(
      url,
      {
        method: opts.method ?? "GET",
        headers: opts.headers,
        timeout: opts.timeoutMs ?? 8000,
        ...(isHttps ? { rejectUnauthorized: !config.insecureTls } : {}),
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }),
        );
      },
    );
    req.on("timeout", () => req.destroy(new FrigateError("Timed out talking to Frigate")));
    req.on("error", (e) => reject(e instanceof FrigateError ? e : new FrigateError(`Cannot reach Frigate: ${e.message}`)));
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

let cookie: string | null = null;

async function login(): Promise<void> {
  const res = await rawRequest("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user: config.frigateUser, password: config.frigatePassword }),
  });
  if (res.status !== 200) {
    throw new FrigateError(`Frigate login failed (HTTP ${res.status}). Check FRIGATE_USER / FRIGATE_PASSWORD.`, res.status);
  }
  const setCookie = res.headers["set-cookie"];
  const tokenCookie = (Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [])
    .map((c) => c.split(";")[0])
    .find((c) => c.startsWith("frigate_token="));
  if (!tokenCookie) throw new FrigateError("Frigate login succeeded but returned no frigate_token cookie.");
  cookie = tokenCookie;
}

// Authenticated request. Logs in on first use and once more if the token is rejected.
export async function frigate(path: string): Promise<FrigateResponse> {
  if (!cookie) await login();
  let res = await rawRequest(path, { headers: { Cookie: cookie as string } });
  if (res.status === 401) {
    await login();
    res = await rawRequest(path, { headers: { Cookie: cookie as string } });
  }
  return res;
}

export async function frigateJson<T>(path: string): Promise<T> {
  const res = await frigate(path);
  if (res.status !== 200) throw new FrigateError(`Frigate returned HTTP ${res.status} for ${path}`, res.status);
  return JSON.parse(res.body.toString("utf8")) as T;
}

export interface UpgradeResult {
  response: http.IncomingMessage;
  socket: Socket;
  head: Buffer;
}

// Opens a WebSocket connection to Frigate (used for live video) and hands back the raw socket,
// so Lookout can tunnel the browser's connection straight through. The login cookie is added here.
export async function frigateUpgrade(path: string, clientHeaders: http.IncomingHttpHeaders): Promise<UpgradeResult> {
  const key = clientHeaders["sec-websocket-key"];
  if (typeof key !== "string") throw new FrigateError("Not a WebSocket request", 400);
  const version = clientHeaders["sec-websocket-version"];
  const protocol = clientHeaders["sec-websocket-protocol"];
  const url = new URL(config.frigateUrl + path);
  const isHttps = url.protocol === "https:";
  const lib = isHttps ? https : http;

  const attempt = () =>
    new Promise<UpgradeResult>((resolve, reject) => {
      const headers: Record<string, string> = {
        Cookie: cookie as string,
        Connection: "Upgrade",
        Upgrade: "websocket",
        "Sec-WebSocket-Key": key,
        "Sec-WebSocket-Version": typeof version === "string" ? version : "13",
      };
      if (typeof protocol === "string") headers["Sec-WebSocket-Protocol"] = protocol;
      const req = lib.request(url, {
        method: "GET",
        headers,
        timeout: 8000,
        ...(isHttps ? { rejectUnauthorized: !config.insecureTls } : {}),
      });
      req.on("upgrade", (response, socket, head) => {
        socket.setTimeout(0);
        resolve({ response, socket, head });
      });
      req.on("response", (response) => {
        response.resume();
        reject(new FrigateError(`Frigate refused the live stream (HTTP ${response.statusCode})`, response.statusCode));
      });
      req.on("timeout", () => req.destroy(new Error("timed out")));
      req.on("error", (e) => reject(e instanceof FrigateError ? e : new FrigateError(`Cannot reach Frigate: ${e.message}`)));
      req.end();
    });

  if (!cookie) await login();
  try {
    return await attempt();
  } catch (e) {
    if ((e as FrigateError).status !== 401) throw e;
    await login();
    return attempt();
  }
}

// Streams a Frigate response straight to the browser (used for clips), passing Range requests
// through so the video can seek without Lookout holding the whole file in memory.
export async function frigateStream(path: string, range: string | undefined, out: http.ServerResponse): Promise<void> {
  const url = new URL(config.frigateUrl + path);
  const isHttps = url.protocol === "https:";
  const lib = isHttps ? https : http;

  const open = () =>
    new Promise<http.IncomingMessage>((resolve, reject) => {
      const headers: Record<string, string> = { Cookie: cookie as string };
      if (range) headers.Range = range;
      const req = lib.request(
        url,
        { method: "GET", headers, timeout: 15000, ...(isHttps ? { rejectUnauthorized: !config.insecureTls } : {}) },
        resolve,
      );
      req.on("timeout", () => req.destroy(new Error("timed out")));
      req.on("error", (e) => reject(new FrigateError(`Cannot reach Frigate: ${e.message}`)));
      req.end();
    });

  if (!cookie) await login();
  let res = await open();
  if (res.statusCode === 401) {
    res.resume();
    await login();
    res = await open();
  }
  const headers: Record<string, string> = { "Cache-Control": "no-cache" };
  for (const k of ["content-type", "content-length", "content-range", "accept-ranges", "last-modified"]) {
    const v = res.headers[k];
    if (typeof v === "string") headers[k] = v;
  }
  out.writeHead(res.statusCode ?? 502, headers);
  res.pipe(out);
  out.on("close", () => res.destroy());
}
