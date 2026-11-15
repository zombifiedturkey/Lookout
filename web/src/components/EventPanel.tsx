import { useEffect, useState } from "react";
import { eventClipUrl, eventSnapshotUrl, type EventItem } from "../api";
import { dayLabel, duration, eventTitle, timeOfDay } from "../lib/format";
import ClipPlayer from "./ClipPlayer";

interface Props {
  event: EventItem;
  onClose: () => void;
}

export default function EventPanel({ event, onClose }: Props) {
  const [mode, setMode] = useState<"clip" | "snapshot">(event.hasClip ? "clip" : "snapshot");
  const [clipFailed, setClipFailed] = useState(false);
  const dur = duration(event);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const showClip = mode === "clip" && event.hasClip && !clipFailed;

  const tab = (active: boolean) =>
    `rounded-full border px-3 py-1.5 text-sm ${active ? "border-white/30 bg-white/20" : "border-white/15 bg-white/5 hover:bg-white/15"}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 backdrop-blur-md sm:p-8" onClick={onClose}>
      <div
        className="flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-white/15 bg-white/10 shadow-2xl shadow-black/60 backdrop-blur-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
          <div>
            <div className="text-lg font-semibold">
              {eventTitle(event)} · {event.cameraLabel}
            </div>
            <div className="text-sm text-white/60">
              {dayLabel(event.startTime)}, {timeOfDay(event.startTime)}
              {dur ? ` · ${dur}` : " · in progress"}
              {event.score !== null ? ` · ${event.score}% confidence` : ""}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {event.hasClip && (
              <button type="button" className={tab(showClip)} onClick={() => setMode("clip")}>
                Clip
              </button>
            )}
            {event.hasSnapshot && (
              <button type="button" className={tab(!showClip)} onClick={() => setMode("snapshot")}>
                Snapshot
              </button>
            )}
            <button type="button" onClick={onClose} className="rounded-full border border-white/15 bg-white/10 px-4 py-1.5 text-sm hover:bg-white/20">
              Close
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 bg-black/40">
          {showClip ? (
            <ClipPlayer
              key={event.id}
              src={eventClipUrl(event.id)}
              poster={event.hasSnapshot ? eventSnapshotUrl(event.id) : undefined}
              onError={() => setClipFailed(true)}
            />
          ) : event.hasSnapshot ? (
            <img src={eventSnapshotUrl(event.id)} alt="" className="mx-auto max-h-[75vh] w-full object-contain" />
          ) : (
            <div className="flex aspect-video items-center justify-center text-white/50">No clip or snapshot saved for this event</div>
          )}
          {clipFailed && <p className="px-5 py-2 text-sm text-rose-200">The clip couldn't be played, showing the snapshot instead.</p>}
        </div>
      </div>
    </div>
  );
}
