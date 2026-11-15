import { useState } from "react";
import type { Camera } from "../api";
import { useSnapshot } from "../hooks/useSnapshot";
import StatusDot from "./StatusDot";
import LiveVideo, { type LiveState } from "./LiveVideo";

interface Props {
  camera: Camera;
  onOpen: () => void;
  // false while full-screen is open or the tab is hidden, so only the streams being watched are running
  liveActive: boolean;
}

export default function CameraTile({ camera, onOpen, liveActive }: Props) {
  const [liveState, setLiveState] = useState<LiveState>("connecting");
  const live = liveActive && liveState === "live";
  const useStillImage = !live; // stills fill in while live video is connecting, paused or unavailable
  const { src, status: stillStatus } = useSnapshot(camera.name, 480, 2000, useStillImage);
  const status = live ? "live" : stillStatus;

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

      {liveActive && (
        <LiveVideo
          camera={camera.name}
          quality="sub"
          onState={setLiveState}
          className={`absolute inset-0 h-full w-full bg-black object-cover transition-opacity ${live ? "opacity-100" : "opacity-0"}`}
        />
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
