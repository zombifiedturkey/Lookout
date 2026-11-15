import { eventThumbUrl, type EventItem } from "../api";
import { GROUP_STYLES, duration, eventTitle, labelGroup, timeOfDay } from "../lib/format";

export default function EventCard({ event, onOpen }: { event: EventItem; onOpen: () => void }) {
  const style = GROUP_STYLES[labelGroup(event.label)];
  const dur = duration(event);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative aspect-video w-full overflow-hidden rounded-3xl border border-white/15 bg-white/5 text-left shadow-xl shadow-black/40 outline-none transition hover:border-white/30 focus-visible:ring-2 focus-visible:ring-sky-400"
    >
      <img src={eventThumbUrl(event.id)} alt="" loading="lazy" className="h-full w-full object-cover" draggable={false} />

      <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full border border-white/15 bg-black/35 px-3 py-1 text-xs font-medium backdrop-blur-xl">
        <span className={`inline-block h-2 w-2 rounded-full ${style.dot}`} />
        {eventTitle(event)}
        {event.score !== null && <span className="text-white/60">{event.score}%</span>}
      </div>

      {event.hasClip && (
        <div className="absolute right-3 top-3 rounded-full border border-white/15 bg-black/35 px-2.5 py-1 text-xs backdrop-blur-xl">▶ Clip</div>
      )}

      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-black/70 to-transparent px-4 pb-3 pt-10 text-sm">
        <span className="font-medium">{event.cameraLabel}</span>
        <span className="text-white/70">
          {timeOfDay(event.startTime)}
          {dur ? ` · ${dur}` : " · in progress"}
        </span>
      </div>
    </button>
  );
}
