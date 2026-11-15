import { useEffect } from "react";
import type { Camera } from "../api";
import { useSnapshot } from "../hooks/useSnapshot";
import StatusDot from "./StatusDot";

interface Props {
  cameras: Camera[];
  index: number;
  onChange: (index: number) => void;
  onClose: () => void;
}

export default function FullscreenView({ cameras, index, onChange, onClose }: Props) {
  const camera = cameras[index];
  const { src, status } = useSnapshot(camera.name, 1080, 1000);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") onChange((index + 1) % cameras.length);
      if (e.key === "ArrowLeft") onChange((index - 1 + cameras.length) % cameras.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, cameras.length, onChange, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 backdrop-blur-md sm:p-8" onClick={onClose}>
      <div
        className="flex max-h-full w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-white/15 bg-white/10 shadow-2xl shadow-black/60 backdrop-blur-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-3">
          <div className="flex items-center gap-3 text-lg font-semibold">
            <StatusDot status={status} />
            {camera.label}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onChange((index - 1 + cameras.length) % cameras.length)}
              className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20"
              aria-label="Previous camera"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => onChange((index + 1) % cameras.length)}
              className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20"
              aria-label="Next camera"
            >
              ›
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-white/15 bg-white/10 px-4 py-1.5 text-sm hover:bg-white/20"
            >
              Close
            </button>
          </div>
        </div>

        <div className="relative min-h-0 flex-1 bg-black/40">
          {src ? (
            <img
              src={src}
              alt={camera.label}
              className={`mx-auto max-h-[75vh] w-full object-contain ${status === "offline" ? "opacity-40 grayscale" : ""}`}
              draggable={false}
            />
          ) : (
            <div className="flex aspect-video items-center justify-center text-white/50">Connecting…</div>
          )}
        </div>
      </div>
    </div>
  );
}
