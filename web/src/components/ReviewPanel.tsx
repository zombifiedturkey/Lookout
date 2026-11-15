import { useEffect, useState } from "react";
import { reviewClipUrl, reviewThumbUrl, type ReviewItem } from "../api";
import { dateTime, objectsTitle } from "../lib/format";

interface Props {
  item: ReviewItem;
  onClose: () => void;
}

export default function ReviewPanel({ item, onClose }: Props) {
  const [clipFailed, setClipFailed] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const dur = item.endTime === null ? null : Math.max(1, Math.round(item.endTime - item.startTime));
  const dot = item.severity === "alert" ? "bg-rose-400" : "bg-amber-400";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 backdrop-blur-md sm:p-8" onClick={onClose}>
      <div
        className="flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-white/15 bg-white/10 shadow-2xl shadow-black/60 backdrop-blur-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
          <div>
            <div className="flex items-center gap-2 text-lg font-semibold">
              <span className={`inline-block h-2.5 w-2.5 rounded-full ${dot}`} />
              {objectsTitle(item.objects)} · {item.cameraLabel}
            </div>
            <div className="text-sm text-white/60">
              {dateTime(item.startTime)}
              {dur !== null ? ` · ${dur}s` : " · in progress"}
              {item.zones.length > 0 ? ` · ${item.zones.join(", ")}` : ""}
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-white/15 bg-white/10 px-4 py-1.5 text-sm hover:bg-white/20">
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 bg-black/40">
          {clipFailed ? (
            <>
              <img src={reviewThumbUrl(item.id)} alt="" className="mx-auto max-h-[75vh] w-full object-contain" />
              <p className="px-5 py-2 text-sm text-rose-200">The clip couldn't be played, showing the preview image instead.</p>
            </>
          ) : (
            <video
              key={item.id}
              src={reviewClipUrl(item.id)}
              poster={reviewThumbUrl(item.id)}
              controls
              autoPlay
              playsInline
              onError={() => setClipFailed(true)}
              className="mx-auto max-h-[75vh] w-full bg-black object-contain"
            />
          )}
        </div>
      </div>
    </div>
  );
}
