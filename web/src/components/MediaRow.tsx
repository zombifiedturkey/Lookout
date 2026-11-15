import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

interface Props {
  title?: ReactNode; // leave out for a bare strip (no heading or arrows)
  count: number; // number of tiles in the row
  empty?: string; // shown instead of the row when count is 0
  scrollerClass?: string;
  children: ReactNode;
}

const arrow =
  "hidden h-8 w-8 place-items-center rounded-full border border-white/15 bg-white/10 text-lg leading-none backdrop-blur-xl hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-white/10 sm:grid";

// A media-player style row: a heading, then tiles in a line that scrolls sideways (arrows on desktop, swipe on touch).
// Mouse wheel scrolling over the row moves it sideways too.
export default function MediaRow({ title, count, empty, scrollerClass = "", children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEdge({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  }, []);

  useEffect(() => {
    measure();
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    // Turn the vertical mouse wheel into sideways scrolling, but only while the row can still move that way,
    // so the page itself can still be scrolled past it.
    const onWheel = (e: WheelEvent) => {
      if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      const canGoLeft = el.scrollLeft > 0;
      const canGoRight = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
      if ((e.deltaY < 0 && canGoLeft) || (e.deltaY > 0 && canGoRight)) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      ro.disconnect();
      el.removeEventListener("wheel", onWheel);
    };
  }, [measure, count]);

  const page = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.85, behavior: "smooth" });

  return (
    <section className="flex flex-col gap-3">
      {title !== undefined && (
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-baseline gap-2 text-base font-semibold">
            {title}
            <span className="text-sm font-normal text-white/40">{count}</span>
          </h2>
          {count > 0 && (
            <div className="flex gap-2">
              <button type="button" className={arrow} onClick={() => page(-1)} disabled={!edge.left} aria-label="Scroll left">
                ‹
              </button>
              <button type="button" className={arrow} onClick={() => page(1)} disabled={!edge.right} aria-label="Scroll right">
                ›
              </button>
            </div>
          )}
        </div>
      )}

      {count === 0 ? (
        empty ? <p className="text-sm text-white/50">{empty}</p> : null
      ) : (
        <div
          ref={ref}
          onScroll={measure}
          className={`no-scrollbar -mx-1 -my-3 flex scroll-px-1 snap-x snap-proximity gap-4 overflow-x-auto px-1 py-3 sm:gap-6 ${scrollerClass}`}
        >
          {children}
        </div>
      )}
    </section>
  );
}
