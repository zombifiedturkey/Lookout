import { useState } from "react";
import { eventClipUrl, eventSnapshotUrl, type EventItem } from "../api";
import { dayLabel, duration, eventTitle, timeOfDay } from "../lib/format";
import ClipPlayer from "./ClipPlayer";
import Popup from "./Popup";

interface Props {
  event: EventItem;
  onClose: () => void;
}

export default function EventPanel({ event, onClose }: Props) {
  const [mode, setMode] = useState<"clip" | "snapshot">(event.hasClip ? "clip" : "snapshot");
  const [clipFailed, setClipFailed] = useState(false);
  const dur = duration(event);
  const title = eventTitle(event);

  const showClip = mode === "clip" && event.hasClip && !clipFailed;

  const tab = (active: boolean) =>
    `rounded-full border px-3 py-1.5 text-sm ${active ? "border-white/30 bg-white/20" : "border-white/15 bg-white/5 hover:bg-white/15"}`;

  return (
    <Popup
      onClose={onClose}
      title={`${title} · ${event.cameraLabel}`}
      subtitle={`${dayLabel(event.startTime)}, ${timeOfDay(event.startTime)}${dur ? ` · ${dur}` : " · in progress"}${event.score !== null ? ` · ${event.score}% confidence` : ""}`}
      actions={
        <>
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
        </>
      }
    >
      {showClip ? (
        <ClipPlayer
          key={event.id}
          src={eventClipUrl(event.id)}
          poster={event.hasSnapshot ? eventSnapshotUrl(event.id) : undefined}
          onError={() => setClipFailed(true)}
          save={{
            kind: "event",
            id: event.id,
            camera: event.camera,
            cameraLabel: event.cameraLabel,
            label: title,
            recordedAt: event.startTime,
            defaultName: `${title} · ${event.cameraLabel} · ${dayLabel(event.startTime)} ${timeOfDay(event.startTime)}`,
          }}
        />
      ) : event.hasSnapshot ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 overflow-auto p-4">
          <img src={eventSnapshotUrl(event.id)} alt="" className="max-h-full max-w-full object-contain" />
          {clipFailed && <p className="text-sm text-rose-200">The clip couldn't be played, showing the snapshot instead.</p>}
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center text-white/50">No clip or snapshot saved for this event</div>
      )}
    </Popup>
  );
}
