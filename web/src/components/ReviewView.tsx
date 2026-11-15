import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchCameras, fetchReview, markReviewViewed, type Camera, type ReviewItem } from "../api";
import { loadViewed, saveViewed } from "../lib/viewed";
import ReviewCard from "./ReviewCard";
import ReviewPanel from "./ReviewPanel";
import ReviewTimeline from "./ReviewTimeline";

type Severity = "alert" | "detection";

const RANGES = [
  { hours: 24, label: "Last 24 hours" },
  { hours: 72, label: "Last 3 days" },
  { hours: 168, label: "Last 7 days" },
];

const pill = (active: boolean) =>
  `rounded-full border px-4 py-1.5 text-sm backdrop-blur-xl ${
    active ? "border-white/30 bg-white/20" : "border-white/15 bg-white/5 hover:bg-white/15"
  }`;

const selectClass =
  "rounded-full border border-white/15 bg-white/10 px-4 py-1.5 text-sm outline-none backdrop-blur-xl [&>option]:bg-slate-900";

export default function ReviewView() {
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [severity, setSeverity] = useState<Severity>("alert");
  const [camera, setCamera] = useState("all");
  const [hours, setHours] = useState(24);
  const [showReviewed, setShowReviewed] = useState(true);
  const [open, setOpen] = useState<ReviewItem | null>(null);
  const [viewed, setViewed] = useState<Set<string>>(loadViewed);
  const [rangeEnd, setRangeEnd] = useState(() => Math.floor(Date.now() / 1000));
  const [visible, setVisible] = useState<{ from: number; to: number } | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchCameras(ctrl.signal)
      .then(setCameras)
      .catch(() => undefined);
    return () => ctrl.abort();
  }, []);

  useEffect(() => {
    let stopped = false;
    const ctrl = new AbortController();
    setItems(null);
    const load = () =>
      fetchReview(hours, ctrl.signal)
        .then((list) => {
          if (stopped) return;
          setItems(list);
          setRangeEnd(Math.floor(Date.now() / 1000));
          setError(null);
        })
        .catch((e: Error) => {
          if (!stopped && e.name !== "AbortError") setError(e.message);
        });
    load();
    const timer = window.setInterval(() => {
      if (!document.hidden) load();
    }, 20000);
    return () => {
      stopped = true;
      ctrl.abort();
      window.clearInterval(timer);
    };
  }, [hours]);

  const isReviewed = useCallback((i: ReviewItem) => i.reviewed || viewed.has(i.id), [viewed]);

  // Everything except the severity tab, so the tab counts stay meaningful.
  const base = useMemo(
    () => (items ?? []).filter((i) => (camera === "all" || i.camera === camera) && (showReviewed || !isReviewed(i))),
    [items, camera, showReviewed, isReviewed],
  );
  const alertCount = base.filter((i) => i.severity === "alert").length;
  const detectionCount = base.length - alertCount;
  const shown = useMemo(() => base.filter((i) => i.severity === severity), [base, severity]);

  // Track which cards are on screen so the timeline can show where you are.
  useEffect(() => {
    const times = new Map(shown.map((i) => [i.id, i.startTime]));
    const inView = new Map<string, number>();
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const id = (e.target as HTMLElement).dataset.reviewId;
          if (!id) continue;
          const t = times.get(id);
          if (t === undefined) continue;
          if (e.isIntersecting) inView.set(id, t);
          else inView.delete(id);
        }
        const ts = [...inView.values()];
        setVisible(ts.length > 0 ? { from: Math.min(...ts), to: Math.max(...ts) } : null);
      },
      { threshold: 0.4 },
    );
    document.querySelectorAll<HTMLElement>("[data-review-id]").forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [shown]);

  const openItem = (item: ReviewItem) => {
    setOpen(item);
    if (!isReviewed(item)) {
      const next = new Set(viewed);
      next.add(item.id);
      setViewed(next);
      saveViewed(next);
      void markReviewViewed(item.id);
    }
  };

  const close = useCallback(() => setOpen(null), []);

  const jumpTo = (id: string) => {
    document
      .querySelector(`[data-review-id="${CSS.escape(id)}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <div className="flex flex-col gap-4 pb-4 sm:gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <button type="button" className={pill(severity === "alert")} onClick={() => setSeverity("alert")}>
            <span className="mr-2 inline-block h-2 w-2 rounded-full bg-rose-400" />
            Alerts · {alertCount}
          </button>
          <button type="button" className={pill(severity === "detection")} onClick={() => setSeverity("detection")}>
            <span className="mr-2 inline-block h-2 w-2 rounded-full bg-amber-400" />
            Detections · {detectionCount}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select value={camera} onChange={(e) => setCamera(e.target.value)} className={selectClass} aria-label="Camera">
            <option value="all">All cameras</option>
            {cameras.map((c) => (
              <option key={c.name} value={c.name}>
                {c.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            role="switch"
            aria-checked={showReviewed}
            onClick={() => setShowReviewed((v) => !v)}
            className="flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-1.5 text-sm backdrop-blur-xl"
          >
            <span className={`relative inline-block h-5 w-9 rounded-full transition ${showReviewed ? "bg-sky-500/80" : "bg-white/20"}`}>
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${showReviewed ? "left-[1.125rem]" : "left-0.5"}`}
              />
            </span>
            Show reviewed
          </button>
          <select value={hours} onChange={(e) => setHours(Number(e.target.value))} className={selectClass} aria-label="Time range">
            {RANGES.map((r) => (
              <option key={r.hours} value={r.hours}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="rounded-3xl border border-rose-400/30 bg-rose-500/10 p-5 backdrop-blur-xl">
          <p className="font-medium">Couldn't load review items</p>
          <p className="mt-1 text-sm text-white/70">{error}</p>
        </div>
      )}

      {!items && !error && <p className="text-white/50">Loading…</p>}
      {items && shown.length === 0 && (
        <p className="text-white/50">{showReviewed ? "Nothing to show for these filters." : "Nothing left to review."}</p>
      )}

      <div className="tile-grid">
        {shown.map((i) => (
          <ReviewCard key={i.id} item={i} reviewed={isReviewed(i)} onOpen={() => openItem(i)} />
        ))}
      </div>

      <div className="sticky bottom-4 z-10 mt-2 sm:bottom-6">
        <ReviewTimeline
          items={shown}
          rangeStart={rangeEnd - hours * 3600}
          rangeEnd={rangeEnd}
          visible={visible}
          onPick={jumpTo}
        />
      </div>

      {open && <ReviewPanel item={open} onClose={close} />}
    </div>
  );
}
