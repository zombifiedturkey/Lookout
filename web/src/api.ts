export interface Camera {
  name: string;
  label: string;
}

const TOKEN_KEY = "lookout_token";

// If Lookout has LOOKOUT_TOKEN set, open the page once as  /?token=YOURTOKEN
// and it is remembered in this browser.
function getToken(): string {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("token");
    if (fromUrl) {
      localStorage.setItem(TOKEN_KEY, fromUrl);
      return fromUrl;
    }
    return localStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

function authHeaders(): Record<string, string> {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export async function fetchCameras(signal?: AbortSignal): Promise<Camera[]> {
  const res = await fetch("/api/cameras", { headers: authHeaders(), signal });
  if (!res.ok) throw new Error(res.status === 401 ? "Unauthorised: Lookout token missing or wrong" : `Lookout returned HTTP ${res.status}`);
  const data = (await res.json()) as { cameras: Camera[] };
  return data.cameras;
}

export async function fetchSnapshot(name: string, height: number, signal?: AbortSignal): Promise<Blob> {
  const res = await fetch(`/api/cameras/${encodeURIComponent(name)}/snapshot.jpg?h=${height}`, {
    headers: authHeaders(),
    signal,
  });
  if (!res.ok) throw new Error(`Snapshot failed: HTTP ${res.status}`);
  return res.blob();
}

// <img>, <video> and WebSocket cannot send an Authorization header, so for those the token goes in the URL.
export function withToken(url: string): string {
  const t = getToken();
  if (!t) return url;
  return `${url}${url.includes("?") ? "&" : "?"}token=${encodeURIComponent(t)}`;
}

export function liveUrl(camera: string, quality: "main" | "sub" = "main"): string {
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  const base = `${proto}://${window.location.host}/api/cameras/${encodeURIComponent(camera)}/live`;
  return withToken(quality === "sub" ? `${base}?quality=sub` : base);
}

export interface EventItem {
  id: string;
  camera: string;
  cameraLabel: string;
  label: string;
  subLabel: string | null;
  startTime: number;
  endTime: number | null;
  hasClip: boolean;
  hasSnapshot: boolean;
  score: number | null;
}

export async function fetchEvents(signal?: AbortSignal): Promise<EventItem[]> {
  const res = await fetch("/api/events?limit=100", { headers: authHeaders(), signal });
  if (!res.ok) throw new Error(res.status === 401 ? "Unauthorised: Lookout token missing or wrong" : `Lookout returned HTTP ${res.status}`);
  const data = (await res.json()) as { events: EventItem[] };
  return data.events;
}

export const eventThumbUrl = (id: string) => withToken(`/api/events/${encodeURIComponent(id)}/thumbnail.jpg`);
export const eventSnapshotUrl = (id: string) => withToken(`/api/events/${encodeURIComponent(id)}/snapshot.jpg`);
export const eventClipUrl = (id: string) => withToken(`/api/events/${encodeURIComponent(id)}/clip.mp4`);

// Is this browser logged in? (cookie from the login page, or a saved/URL token)
export async function checkSession(signal?: AbortSignal): Promise<boolean> {
  const res = await fetch("/api/session", { headers: authHeaders(), signal });
  if (res.status === 401) return false;
  if (!res.ok) throw new Error(`Lookout returned HTTP ${res.status}`);
  return true;
}

export async function login(password: string): Promise<void> {
  const res = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (res.ok) return;
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  throw new Error(data.error ?? `Lookout returned HTTP ${res.status}`);
}

export async function logout(): Promise<void> {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
  await fetch("/api/logout", { method: "POST" });
}

export interface ReviewItem {
  id: string;
  camera: string;
  cameraLabel: string;
  severity: "alert" | "detection";
  startTime: number;
  endTime: number | null;
  reviewed: boolean;
  objects: string[];
  zones: string[];
  detectionIds: string[];
}

export async function fetchReview(hours: number, signal?: AbortSignal): Promise<ReviewItem[]> {
  const res = await fetch(`/api/review?hours=${hours}`, { headers: authHeaders(), signal });
  if (!res.ok) throw new Error(res.status === 401 ? "Unauthorised: please sign in again" : `Lookout returned HTTP ${res.status}`);
  const data = (await res.json()) as { items: ReviewItem[] };
  return data.items;
}

export const reviewThumbUrl = (id: string) => withToken(`/api/review/${encodeURIComponent(id)}/thumbnail.jpg`);
export const reviewClipUrl = (id: string) => withToken(`/api/review/${encodeURIComponent(id)}/clip.mp4`);

// Best effort: tell Frigate this item has been seen. Failures are ignored (Lookout also remembers locally).
export async function markReviewViewed(id: string): Promise<void> {
  try {
    await fetch(`/api/review/${encodeURIComponent(id)}/viewed`, { method: "POST", headers: authHeaders() });
  } catch {
    /* ignore */
  }
}

export interface SavedClip {
  id: string;
  name: string;
  camera: string;
  cameraLabel: string;
  label: string;
  recordedAt: number;
  duration: number;
  createdAt: number;
  size: number;
}

export interface SaveClipInput {
  kind: "review" | "event";
  id: string;
  start: number;
  end: number;
  name: string;
  camera: string;
  cameraLabel: string;
  label: string;
  recordedAt: number;
}

async function errorText(res: Response): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  return data.error ?? `Lookout returned HTTP ${res.status}`;
}

export async function fetchSaved(signal?: AbortSignal): Promise<SavedClip[]> {
  const res = await fetch("/api/saved", { headers: authHeaders(), signal });
  if (!res.ok) throw new Error(await errorText(res));
  return ((await res.json()) as { items: SavedClip[] }).items;
}

export async function saveClip(input: SaveClipInput): Promise<SavedClip> {
  const res = await fetch("/api/saved", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await errorText(res));
  return ((await res.json()) as { item: SavedClip }).item;
}

export async function deleteSaved(id: string): Promise<void> {
  const res = await fetch(`/api/saved/${encodeURIComponent(id)}`, { method: "DELETE", headers: authHeaders() });
  if (!res.ok) throw new Error(await errorText(res));
}

export const savedThumbUrl = (id: string) => withToken(`/api/saved/${encodeURIComponent(id)}/thumbnail.jpg`);
export const savedClipUrl = (id: string, download = false) =>
  withToken(`/api/saved/${encodeURIComponent(id)}/clip.mp4${download ? "?download=1" : ""}`);
