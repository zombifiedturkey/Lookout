import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchEvents, type EventItem } from "../api";
import { labelGroup, type LabelGroup } from "../lib/format";
import EventCard from "./EventCard";
import EventPanel from "./EventPanel";
import MediaRow from "./MediaRow";

// One row per kind of thing the cameras saw, newest first. "Other" only appears if Frigate detected something else.
const ROWS: { group: LabelGroup; title: string; empty: string }[] = [
  { group: "person", title: "People", empty: "No people detected recently." },
  { group: "car", title: "Cars", empty: "No cars detected recently." },
  { group: "animal", title: "Animals", empty: "No animals detected recently." },
  { group: "other", title: "Other", empty: "" },
];

export default function EventsView() {
  const [events, setEvents] = useState<EventItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<EventItem | null>(null);

  useEffect(() => {
    let stopped = false;
    const ctrl = new AbortController();
    const load = () =>
      fetchEvents(ctrl.signal)
        .then((e) => {
          if (stopped) return;
          setEvents(e);
          setError(null);
        })
        .catch((e: Error) => {
          if (!stopped && e.name !== "AbortError") setError(e.message);
        });
    load();
    const timer = window.setInterval(() => {
      if (!document.hidden) load();
    }, 15000);
    return () => {
      stopped = true;
      ctrl.abort();
      window.clearInterval(timer);
    };
  }, []);

  const close = useCallback(() => setOpen(null), []);

  const rows = useMemo(() => {
    const byGroup = new Map<LabelGroup, EventItem[]>();
    for (const e of events ?? []) {
      const g = labelGroup(e.label);
      byGroup.set(g, [...(byGroup.get(g) ?? []), e]);
    }
    return ROWS.map((r) => ({ ...r, items: (byGroup.get(r.group) ?? []).sort((a, b) => b.startTime - a.startTime) })).filter(
      (r) => r.group !== "other" || r.items.length > 0,
    );
  }, [events]);

  return (
    <div className="flex flex-col gap-6 pb-4 sm:gap-8">
      {error && (
        <div className="rounded-3xl border border-rose-400/30 bg-rose-500/10 p-5 backdrop-blur-xl">
          <p className="font-medium">Couldn't load events</p>
          <p className="mt-1 text-sm text-white/70">{error}</p>
        </div>
      )}

      {!events && !error && <p className="text-white/50">Loading…</p>}

      {events &&
        rows.map((r) => (
          <MediaRow key={r.group} title={r.title} count={r.items.length} empty={r.empty}>
            {r.items.map((e) => (
              <div key={e.id} className="row-tile snap-start">
                <EventCard event={e} onOpen={() => setOpen(e)} />
              </div>
            ))}
          </MediaRow>
        ))}

      {open && <EventPanel event={open} onClose={close} />}
    </div>
  );
}
