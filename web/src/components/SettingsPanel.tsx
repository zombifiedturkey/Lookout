import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { removeWallpaper, uploadWallpaper } from "../api";
import {
  DEFAULT_COLOURS,
  resetSettings,
  setWallpaperVersion,
  updateSettings,
  useAppearance,
  type Corners,
  type TileSize,
} from "../lib/settings";

const MAX_UPLOAD = 15 * 1024 * 1024;
const MAX_SIDE = 2560;

// Big photos are shrunk before they are sent: a wallpaper doesn't need more than 2560 px, and the upload is much quicker.
async function prepare(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    if (scale === 1 && /^image\/(jpeg|png|webp)$/.test(file.type) && file.size <= MAX_UPLOAD) {
      bmp.close();
      return file;
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bmp.width * scale));
    canvas.height = Math.max(1, Math.round(bmp.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bmp.close();
      return file;
    }
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    return blob ?? file;
  } catch {
    return file; // let the server say if it can't use it
  }
}

const btn =
  "rounded-full border border-white/15 bg-white/10 px-4 py-1.5 text-sm outline-none hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-sky-400 disabled:opacity-50 disabled:hover:bg-white/10";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-xs font-medium uppercase tracking-wide text-white/50">{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-sm">{label}</div>
      {children}
    </div>
  );
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { id: T; text: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-full border border-white/15 bg-white/5 p-1">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={`flex-1 rounded-full px-3 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
            value === o.id ? "bg-white/20" : "text-white/70 hover:bg-white/10"
          }`}
        >
          {o.text}
        </button>
      ))}
    </div>
  );
}

function ColourField({ label, hint, value, onChange }: { label: string; hint: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span>
        {label}
        <span className="block text-xs text-white/50">{hint}</span>
      </span>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="h-9 w-14 shrink-0 cursor-pointer rounded-full border border-white/20 bg-transparent p-0.5"
      />
    </label>
  );
}

export default function SettingsPanel({ onClose }: { onClose: () => void }) {
  const { settings: s, wallpaper } = useAppearance();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setMessage(null);
    try {
      const image = await prepare(file);
      if (image.size > MAX_UPLOAD) throw new Error("That image is too large (max 15 MB)");
      setWallpaperVersion(await uploadWallpaper(image));
      setMessage({ ok: true, text: "Wallpaper updated." });
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const clear = async () => {
    setBusy(true);
    setMessage(null);
    try {
      setWallpaperVersion(await removeWallpaper());
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  // Small copy of the page background, so changes are visible without closing the panel.
  const preview: CSSProperties = wallpaper
    ? {
        backgroundImage: `linear-gradient(rgba(0,0,0,${s.dim / 100}), rgba(0,0,0,${s.dim / 100})), url(${JSON.stringify(wallpaper)})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : {
        backgroundColor: s.base,
        backgroundImage: `radial-gradient(70% 90% at 15% 0%, color-mix(in srgb, ${s.glow1} 35%, transparent), transparent 70%), radial-gradient(60% 80% at 100% 10%, color-mix(in srgb, ${s.glow2} 25%, transparent), transparent 65%)`,
      };

  const coloursChanged =
    s.base !== DEFAULT_COLOURS.base || s.glow1 !== DEFAULT_COLOURS.glow1 || s.glow2 !== DEFAULT_COLOURS.glow2;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-md sm:items-center sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Settings"
        className="flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-white/15 bg-white/10 shadow-2xl shadow-black/60 backdrop-blur-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between px-5 py-3">
          <div className="text-lg font-semibold">Settings</div>
          <button type="button" onClick={onClose} className={btn}>
            Done
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto border-t border-white/10 bg-black/30 p-5">
          <Section title="Wallpaper">
            <div className="aspect-[16/7] w-full overflow-hidden rounded-2xl border border-white/15" style={preview} />
            <div className="flex flex-wrap gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => void pick(e.target.files?.[0])}
              />
              <button type="button" className={btn} disabled={busy} onClick={() => fileRef.current?.click()}>
                {busy ? "Working…" : wallpaper ? "Change image" : "Upload image"}
              </button>
              {wallpaper && (
                <button type="button" className={btn} disabled={busy} onClick={() => void clear()}>
                  Remove
                </button>
              )}
            </div>
            {message && <p className={`text-sm ${message.ok ? "text-emerald-300" : "text-rose-200"}`}>{message.text}</p>}
            {wallpaper && (
              <label className="flex flex-col gap-2 text-sm">
                <span className="flex justify-between">
                  Darken <span className="tabular-nums text-white/60">{s.dim}%</span>
                </span>
                <input
                  type="range"
                  min={0}
                  max={80}
                  step={5}
                  value={s.dim}
                  onChange={(e) => updateSettings({ dim: Number(e.target.value) })}
                  className="w-full cursor-pointer accent-sky-400"
                />
              </label>
            )}
          </Section>

          <Section title="Background colours">
            <ColourField label="Background" hint="The base colour" value={s.base} onChange={(base) => updateSettings({ base })} />
            <ColourField label="Glow 1" hint="Top left" value={s.glow1} onChange={(glow1) => updateSettings({ glow1 })} />
            <ColourField label="Glow 2" hint="Top right" value={s.glow2} onChange={(glow2) => updateSettings({ glow2 })} />
            {wallpaper && <p className="text-xs text-white/50">These show again when the wallpaper is removed.</p>}
            <div>
              <button type="button" className={btn} disabled={!coloursChanged} onClick={() => updateSettings(DEFAULT_COLOURS)}>
                Reset colours
              </button>
            </div>
          </Section>

          <Section title="Thumbnails">
            <Row label="Size">
              <Segmented<TileSize>
                label="Tile size"
                value={s.tileSize}
                onChange={(tileSize) => updateSettings({ tileSize })}
                options={[
                  { id: "small", text: "Small" },
                  { id: "medium", text: "Medium" },
                  { id: "large", text: "Large" },
                ]}
              />
            </Row>
            <Row label="Corners">
              <Segmented<Corners>
                label="Corners"
                value={s.corners}
                onChange={(corners) => updateSettings({ corners })}
                options={[
                  { id: "square", text: "Square" },
                  { id: "light", text: "Light" },
                  { id: "rounded", text: "Rounded" },
                ]}
              />
            </Row>
            <button
              type="button"
              role="switch"
              aria-checked={s.border}
              onClick={() => updateSettings({ border: !s.border })}
              className="flex items-center justify-between gap-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
            >
              Border
              <span className={`relative inline-block h-5 w-9 rounded-full transition ${s.border ? "bg-sky-500/80" : "bg-white/20"}`}>
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${s.border ? "left-[1.125rem]" : "left-0.5"}`}
                />
              </span>
            </button>
            <div className="tile aspect-video w-32 bg-gradient-to-br from-white/20 to-white/5" aria-hidden="true" />
          </Section>

          <div>
            <button type="button" className={btn} onClick={resetSettings}>
              Reset everything
            </button>
            <p className="mt-2 text-xs text-white/50">
              Colours, tile size, corners and border are saved in this browser. The wallpaper image is shared by every device.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
