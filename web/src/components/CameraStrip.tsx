import { useCallback, useEffect, useState } from "react";
import { fetchReview, markReviewViewed, reviewThumbUrl, type ReviewItem } from "../api";
import { objectsTitle, timeAgo } from "../lib/format";
import { loadViewed, saveViewed } from "../lib/viewed";
import MediaRow from "./MediaRow";
import ReviewPanel from "./ReviewPanel";

const MAX_TILES = 24;

// A row of small tiles for the latest alerts, shown above the camera grid (like the row at the top of Frigate's live page).
// Click one to play it. Nothing is shown at all when there is no recent activity.
export default function CameraStrip() {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [viewed, setViewed] = useState<Set<string>>(loadViewed);
  const [open, setOpen] = useState<ReviewItem | null>(null);

  useEffect(() => {
    let stopped = false;
    const ctrl = new AbortController();
    const load = () =>
      fetchReview(24, ctrl.signal)
        .then((list) => {
          if (stopped) return;
          setItems(
            list
              .filter((i) => i.severity === "alert")
              .sort((a, b) => b.startTime - a.startTime)
              .slice(0, MAX_TILES),
          );
        })
        .catch(() => undefined);
    load();
    const timer = window.setInterval(() => {
      if (!document.hidden) load();
    }, 30000);
    return () => {
      stopped = true;
      ctrl.abort();
      window.clearInterval(timer);
    };
  }, []);

  const openItem = (item: ReviewItem) => {
    setOpen(item);
    if (!item.reviewed && !viewed.has(item.id)) {
      const next = new Set(viewed);
      next.add(item.id);
      setViewed(next);
      saveViewed(next);
      void markReviewViewed(item.id);
    }
  };

  const close = useCallback(() => setOpen(null), []);

  return (
    <>
      {items.length > 0 && (
        <MediaRow count={items.length} scrollerClass="camera-strip">
          {items.map((i) => {
            const seen = i.reviewed || viewed.has(i.id);
            return (
              <button
                key={i.id}
                type="button"
                onClick={() => openItem(i)}
                title={`${objectsTitle(i.objects)} · ${i.cameraLabel}`}
                aria-label={`${objectsTitle(i.objects)}, ${i.cameraLabel}, ${timeAgo(i.startTime)}`}
                className={`tile strip-tile relative aspect-video snap-start overflow-hidden bg-white/5 text-left shadow-lg shadow-black/40 outline-none transition focus-visible:ring-2 focus-visible:ring-sky-400 ${
                  seen ? "opacity-60 hover:opacity-100" : ""
                }`}
              >
                <img src={reviewThumbUrl(i.id)} alt="" loading="lazy" className="h-full w-full object-cover" draggable={false} />
                {!seen && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-sky-400" title="Not reviewed yet" />}
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-2.5 pb-1.5 pt-6 text-xs font-medium">
                  {timeAgo(i.startTime)}
                </span>
              </button>
            );
          })}
        </MediaRow>
      )}
      {open && <ReviewPanel item={open} onClose={close} />}
    </>
  );
}
