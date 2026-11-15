import { useCallback, useEffect, useRef, useState } from "react";

interface Props {
  src: string;
  poster?: string;
  onError: () => void;
}

const SPEEDS = [1, 2, 0.5];

function clock(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const s = Math.floor(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const btn =
  "rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-sm tabular-nums hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-sky-400 outline-none";

// Video player with a large scrub bar. Click the picture or press Space to play/pause, and use the
// left/right arrow keys to jump 5 seconds.
export default function ClipPlayer({ src, poster, onError }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  const toggle = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => undefined);
    else v.pause();
  }, []);

  const skip = useCallback((delta: number) => {
    const v = videoRef.current;
    if (!v) return;
    const max = Number.isFinite(v.duration) ? v.duration : Infinity;
    v.currentTime = Math.min(max, Math.max(0, v.currentTime + delta));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " ") {
        e.preventDefault();
        toggle();
      } else if (e.key === "ArrowRight") skip(5);
      else if (e.key === "ArrowLeft") skip(-5);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, skip]);

  const cycleSpeed = () => {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    setSpeed(next);
    if (videoRef.current) videoRef.current.playbackRate = next;
  };

  const fullscreen = () => {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  };

  const seekable = Number.isFinite(duration) && duration > 0;

  return (
    <div ref={wrapRef} className="flex flex-col bg-black">
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        autoPlay
        playsInline
        onClick={toggle}
        onError={onError}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onDurationChange={(e) => setDuration(e.currentTarget.duration)}
        className="mx-auto max-h-[calc(100dvh-17rem)] w-full cursor-pointer bg-black object-contain"
      />

      <div className="flex flex-col gap-2 border-t border-white/10 bg-white/5 px-4 py-3">
        <input
          type="range"
          aria-label="Seek"
          min={0}
          max={seekable ? duration : 1}
          step={0.05}
          value={seekable ? Math.min(time, duration) : 0}
          disabled={!seekable}
          onChange={(e) => {
            const t = Number(e.target.value);
            setTime(t);
            if (videoRef.current) videoRef.current.currentTime = t;
          }}
          className="h-2 w-full cursor-pointer accent-sky-400 disabled:cursor-default disabled:opacity-40"
        />
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={btn} onClick={toggle} aria-label={playing ? "Pause" : "Play"}>
            {playing ? "❚❚ Pause" : "▶ Play"}
          </button>
          <button type="button" className={btn} onClick={() => skip(-5)} aria-label="Back 5 seconds">
            −5s
          </button>
          <button type="button" className={btn} onClick={() => skip(5)} aria-label="Forward 5 seconds">
            +5s
          </button>
          <span className="px-1 text-sm tabular-nums text-white/70">
            {clock(time)} / {seekable ? clock(duration) : "--:--"}
          </span>
          <div className="ml-auto flex gap-2">
            <button type="button" className={btn} onClick={cycleSpeed} aria-label="Playback speed">
              {speed}×
            </button>
            <button type="button" className={btn} onClick={fullscreen} aria-label="Fullscreen">
              ⛶
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
