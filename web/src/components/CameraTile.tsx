import type { Camera } from "../api";
import { useSnapshot } from "../hooks/useSnapshot";
import StatusDot from "./StatusDot";

export default function CameraTile({ camera, onOpen }: { camera: Camera; onOpen: () => void }) {
  const { src, status } = useSnapshot(camera.name, 480, 2000);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative aspect-video w-full overflow-hidden rounded-3xl border border-white/15 bg-white/5 shadow-2xl shadow-black/40 outline-none transition hover:border-white/30 focus-visible:ring-2 focus-visible:ring-sky-400"
    >
      {src ? (
        <img
          src={src}
          alt={camera.label}
          className={`h-full w-full object-cover transition ${status === "offline" ? "opacity-40 grayscale" : ""}`}
          draggable={false}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-sm text-white/50">Connecting…</div>
      )}

      <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-full border border-white/15 bg-black/30 px-3 py-1.5 text-sm font-medium backdrop-blur-xl">
        <StatusDot status={status} />
        {camera.label}
      </div>

      {status === "offline" && (
        <div className="absolute inset-x-0 top-3 text-center text-xs text-rose-200">Can't reach camera</div>
      )}
    </button>
  );
}
