import { useSyncExternalStore } from "react";
import { fetchWallpaperInfo, wallpaperUrl } from "../api";

// Appearance settings. Colours, tile size, corners and border are remembered per browser (so a phone and a TV can differ);
// the wallpaper image itself lives on the Lookout server, so it is the same everywhere.

export type TileSize = "small" | "medium" | "large";
export type Corners = "square" | "light" | "rounded";

export interface Settings {
  base: string; // page background colour
  glow1: string; // top-left glow
  glow2: string; // top-right glow
  dim: number; // 0-80: how much a wallpaper is darkened, so text stays readable
  tileSize: TileSize;
  corners: Corners;
  border: boolean;
}

export const DEFAULT_COLOURS = { base: "#0b0f17", glow1: "#466ec8", glow2: "#7850be" };

export const DEFAULTS: Settings = {
  ...DEFAULT_COLOURS,
  dim: 35,
  tileSize: "medium",
  corners: "rounded",
  border: true,
};

const KEY = "lookout_settings";
const HEX = /^#[0-9a-f]{6}$/i;

const SIZES: Record<TileSize, string> = { small: "12rem", medium: "22rem", large: "32rem" };
const RADII: Record<Corners, string> = { square: "0px", light: "0.75rem", rounded: "1.5rem" };

function colour(v: unknown, fallback: string): string {
  return typeof v === "string" && HEX.test(v) ? v.toLowerCase() : fallback;
}

function sanitise(p: Partial<Settings>): Settings {
  return {
    base: colour(p.base, DEFAULTS.base),
    glow1: colour(p.glow1, DEFAULTS.glow1),
    glow2: colour(p.glow2, DEFAULTS.glow2),
    dim: typeof p.dim === "number" && p.dim >= 0 && p.dim <= 80 ? p.dim : DEFAULTS.dim,
    tileSize: p.tileSize === "small" || p.tileSize === "medium" || p.tileSize === "large" ? p.tileSize : DEFAULTS.tileSize,
    corners: p.corners === "square" || p.corners === "light" || p.corners === "rounded" ? p.corners : DEFAULTS.corners,
    border: typeof p.border === "boolean" ? p.border : DEFAULTS.border,
  };
}

function load(): Settings {
  try {
    return sanitise(JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Settings>);
  } catch {
    return DEFAULTS;
  }
}

interface State {
  settings: Settings;
  wallpaper: string | null; // URL of the wallpaper, or null when none is set
}

let state: State = { settings: load(), wallpaper: null };
const listeners = new Set<() => void>();

// Pushes the settings into CSS variables on <html>; index.css and the tile styles read them.
function apply(s: State) {
  const root = document.documentElement;
  const set = (k: string, v: string) => root.style.setProperty(k, v);
  set("--bg-base", s.settings.base);
  set("--bg-glow1", s.settings.glow1);
  set("--bg-glow2", s.settings.glow2);
  set("--wall-dim", String(s.settings.dim / 100));
  set("--tile-min", SIZES[s.settings.tileSize]);
  set("--tile-radius", RADII[s.settings.corners]);
  set("--tile-border", s.settings.border ? "rgba(255,255,255,0.15)" : "transparent");
  set("--tile-border-hover", s.settings.border ? "rgba(255,255,255,0.3)" : "transparent");
  if (s.wallpaper) {
    set("--wallpaper", `url(${JSON.stringify(s.wallpaper)})`);
    root.classList.add("has-wallpaper");
  } else {
    root.style.removeProperty("--wallpaper");
    root.classList.remove("has-wallpaper");
  }
}

function change(next: State) {
  state = next;
  apply(state);
  listeners.forEach((l) => l());
}

// Call once before the first render so the page never flashes the default look.
export function initAppearance() {
  apply(state);
}

export function useAppearance(): State {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    () => state,
  );
}

export function updateSettings(patch: Partial<Settings>) {
  const settings = sanitise({ ...state.settings, ...patch });
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* ignore: the change still applies for this visit */
  }
  change({ ...state, settings });
}

export function resetSettings() {
  updateSettings(DEFAULTS);
}

export function setWallpaperVersion(info: { set: boolean; version: number }) {
  change({ ...state, wallpaper: info.set ? wallpaperUrl(info.version) : null });
}

// Asks the server whether a wallpaper is set. Called after sign-in.
export function loadWallpaper(signal?: AbortSignal): Promise<void> {
  return fetchWallpaperInfo(signal)
    .then(setWallpaperVersion)
    .catch(() => undefined);
}
