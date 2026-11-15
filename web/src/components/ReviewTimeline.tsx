import { useMemo, useRef } from "react";
import type { ReviewItem } from "../api";

interface Props {
  items: ReviewItem[];
  rangeStart: number; // unix seconds
  rangeEnd: number;
  visible: { from: number; to: number } | null; // span of the cards currently on screen
  onPick: (id: string) => void;
}

interface Tick {
  t: number;
  label: string;
}

function makeTicks(start: number, end: number): Tick[] {
  const spanH = (end - start) / 3600;
  const stepH = spanH <= 26 ? 3 : spanH <= 80 ? 12 : 24;
  const d = new Date(start * 1000);
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  const out: Tick[] = [];
  while (d.getTime() / 1000 < end) {
    const h = d.getHours();
    if (h % stepH === 0) {
      const label =
        stepH === 24 || h === 0
          ? d.toLocaleDateString([], { weekday: "short", day: "numeric" })
          : d.toLocaleTimeString([], { hour: "numeric" });
      out.push({ t: d.getTime() / 1000, label });
    }
    d.setHours(d.getHours() + 1);
  }
  return out;
}

// Horizontal activity timeline: oldest on the left, now on the right. Tall red marks are alerts, short amber
// marks are detections. The lighter box shows which part of the list is currently on screen; click to jump.
export default function ReviewTimeline({ items, rangeStart, rangeEnd, visible, onPick }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const span = Math.max(1, rangeEnd - rangeStart);
  const ticks = useMemo(() => makeTicks(rangeStart, rangeEnd), [rangeStart, rangeEnd]);

  const pct = (t: number) => Math.min(100, Math.max(0, ((t - rangeStart) / span) * 100));

  const pick = (clientX: number) => {
    const el = trackRef.current;
    if (!el || items.length === 0) return;
    const r = el.getBoundingClientRect();
    const t = rangeStart + ((clientX - r.left) / r.width) * span;
    let best = items[0];
    for (const i of items) {
      if (Math.abs(i.startTime - t) < Math.abs(best.startTime - t)) best = i;
    }
    onPick(best.id);
  };

  const win = visible
    ? { left: Math.max(0, pct(visible.from) - 0.6), right: Math.min(100, pct(visible.to) + 0.6) }
    : null;

  return (
    <div className="rounded-3xl border border-white/15 bg-white/10 px-5 pb-3 pt-4 shadow-2xl shadow-black/50 backdrop-blur-2xl">
      <div
        ref={trackRef}
        role="slider"
        aria-label="Activity timeline"
        aria-valuenow={0}
        className="relative h-10 cursor-pointer"
        onClick={(e) => pick(e.clientX)}
      >
        <div className="absolute inset-x-0 bottom-0 h-px bg-white/25" />
        {win && (
          <div
            className="pointer-events-none absolute inset-y-0 rounded-md border border-white/30 bg-white/15"
            style={{ left: `${win.left}%`, width: `${Math.max(1, win.right - win.left)}%` }}
          />
        )}
        {items.map((i) => (
          <span
            key={i.id}
            className={`pointer-events-none absolute bottom-0 w-1 rounded-full ${
              i.severity === "alert" ? "h-7 bg-rose-400" : "h-4 bg-amber-400"
            }`}
            style={{ left: `calc(${pct(i.startTime)}% - 2px)` }}
          />
        ))}
      </div>
      <div className="relative mt-1 h-4 text-[11px] text-white/45">
        {ticks.map((t) => (
          <span key={t.t} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${pct(t.t)}%` }}>
            {t.label}
          </span>
        ))}
        <span className="absolute right-0 text-white/60">now</span>
      </div>
    </div>
  );
}
