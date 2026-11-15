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

export function liveUrl(camera: string): string {
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return withToken(`${proto}://${window.location.host}/api/cameras/${encodeURIComponent(camera)}/live`);
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
