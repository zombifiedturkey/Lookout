import { useState } from "react";
import { reviewClipUrl, reviewThumbUrl, type ReviewItem } from "../api";
import { dateTime, objectsTitle } from "../lib/format";
import ClipPlayer from "./ClipPlayer";
import Popup from "./Popup";

interface Props {
  item: ReviewItem;
  onClose: () => void;
}

export default function ReviewPanel({ item, onClose }: Props) {
  const [clipFailed, setClipFailed] = useState(false);

  const dur = item.endTime === null ? null : Math.max(1, Math.round(item.endTime - item.startTime));
  const dot = item.severity === "alert" ? "bg-rose-400" : "bg-amber-400";
  const label = objectsTitle(item.objects);

  return (
    <Popup
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} />
          {label} · {item.cameraLabel}
        </span>
      }
      subtitle={`${dateTime(item.startTime)}${dur !== null ? ` · ${dur}s` : " · in progress"}${item.zones.length > 0 ? ` · ${item.zones.join(", ")}` : ""}`}
    >
      {clipFailed ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 overflow-auto p-4">
          <img src={reviewThumbUrl(item.id)} alt="" className="max-h-full max-w-full object-contain" />
          <p className="text-sm text-rose-200">The clip couldn't be played, showing the preview image instead.</p>
        </div>
      ) : (
        <ClipPlayer
          key={item.id}
          src={reviewClipUrl(item.id)}
          poster={reviewThumbUrl(item.id)}
          onError={() => setClipFailed(true)}
          save={{
            kind: "review",
            id: item.id,
            camera: item.camera,
            cameraLabel: item.cameraLabel,
            label,
            recordedAt: item.startTime,
            defaultName: `${label} · ${item.cameraLabel} · ${dateTime(item.startTime)}`,
          }}
        />
      )}
    </Popup>
  );
}
