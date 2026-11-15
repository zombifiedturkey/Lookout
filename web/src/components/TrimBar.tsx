import { useRef } from "react";
import type { PointerEvent } from "react";

interface Props {
  duration: number;
  time: number; // playhead
  start: number;
  end: number;
  onChange: (start: number, end: number) => void;
  onSeek: (t: number) => void;
}

export const MIN_TRIM = 0.3;

// Edit bar: drag the left and right handles to choose the part to keep. Click or drag on the bar to move the playhead.
export default function TrimBar({ duration, time, start, end, onChange, onSeek }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<"start" | "end" | "play" | null>(null);

  const pct = (t: number) => (duration > 0 ? Math.min(100, Math.max(0, (t / duration) * 100)) : 0);

  const toTime = (clientX: number) => {
    const el = trackRef.current;
    if (!el || duration <= 0) return 0;
    const r = el.getBoundingClientRect();
    return Math.min(duration, Math.max(0, ((clientX - r.left) / r.width) * duration));
  };

  const grab = (which: "start" | "end") => (e: PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = which;
  };

  const drag = (which: "start" | "end") => (e: PointerEvent<HTMLDivElement>) => {
    if (dragging.current !== which) return;
    const t = toTime(e.clientX);
    if (which === "start") {
      const s = Math.max(0, Math.min(t, end - MIN_TRIM));
      onChange(s, end);
      onSeek(s);
    } else {
      const en = Math.min(duration, Math.max(t, start + MIN_TRIM));
      onChange(start, en);
      onSeek(en);
    }
  };

  const release = () => {
    dragging.current = null;
  };

  const handle =
    "absolute -top-1 -bottom-1 z-10 w-3 cursor-ew-resize touch-none bg-sky-400 outline-none hover:bg-sky-300 after:absolute after:left-1/2 after:top-1/2 after:h-4 after:w-0.5 after:-translate-x-1/2 after:-translate-y-1/2 after:rounded-full after:bg-black/50";

  return (
    <div className="px-3">
      <div
        ref={trackRef}
        className="relative h-12 cursor-pointer touch-none select-none rounded-lg bg-white/10"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          dragging.current = "play";
          onSeek(toTime(e.clientX));
        }}
        onPointerMove={(e) => {
          if (dragging.current === "play") onSeek(toTime(e.clientX));
        }}
        onPointerUp={release}
        onPointerCancel={release}
      >
        <div
          className="pointer-events-none absolute inset-y-0 border-y-2 border-sky-400 bg-sky-400/25"
          style={{ left: `${pct(start)}%`, width: `${Math.max(0, pct(end) - pct(start))}%` }}
        />
        <div
          role="slider"
          aria-label="Trim start"
          aria-valuenow={Math.round(start * 10) / 10}
          className={`${handle} rounded-l-lg`}
          style={{ left: `calc(${pct(start)}% - 0.75rem)` }}
          onPointerDown={grab("start")}
          onPointerMove={drag("start")}
          onPointerUp={release}
          onPointerCancel={release}
        />
        <div
          role="slider"
          aria-label="Trim end"
          aria-valuenow={Math.round(end * 10) / 10}
          className={`${handle} rounded-r-lg`}
          style={{ left: `${pct(end)}%` }}
          onPointerDown={grab("end")}
          onPointerMove={drag("end")}
          onPointerUp={release}
          onPointerCancel={release}
        />
        <div className="pointer-events-none absolute inset-y-0 z-20 w-0.5 -translate-x-1/2 bg-white shadow" style={{ left: `${pct(time)}%` }} />
      </div>
    </div>
  );
}
