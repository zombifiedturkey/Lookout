import { reviewThumbUrl, type ReviewItem } from "../api";
import { dateTime, objectsTitle, timeAgo } from "../lib/format";

interface Props {
  item: ReviewItem;
  reviewed: boolean;
  onOpen: () => void;
}

export default function ReviewCard({ item, reviewed, onOpen }: Props) {
  const dot = item.severity === "alert" ? "bg-rose-400" : "bg-amber-400";

  return (
    <button
      type="button"
      data-review-id={item.id}
      onClick={onOpen}
      className={`group relative aspect-video w-full overflow-hidden rounded-3xl border border-white/15 bg-white/5 text-left shadow-xl shadow-black/40 outline-none transition hover:border-white/30 focus-visible:ring-2 focus-visible:ring-sky-400 ${
        reviewed ? "opacity-60 hover:opacity-100" : ""
      }`}
    >
      <img src={reviewThumbUrl(item.id)} alt="" loading="lazy" className="h-full w-full object-cover" draggable={false} />

      <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full border border-white/15 bg-black/35 px-3 py-1 text-xs font-medium backdrop-blur-xl">
        <span className={`inline-block h-2 w-2 rounded-full ${dot}`} />
        {objectsTitle(item.objects)}
        {!reviewed && <span className="inline-block h-1.5 w-1.5 rounded-full bg-sky-400" title="Not reviewed yet" />}
      </div>

      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-black/70 to-transparent px-4 pb-3 pt-10 text-sm">
        <span className="font-medium">{item.cameraLabel}</span>
        <span className="text-white/70">
          {timeAgo(item.startTime)} · {dateTime(item.startTime)}
        </span>
      </div>
    </button>
  );
}
