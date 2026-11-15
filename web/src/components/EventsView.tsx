import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchEvents, type EventItem } from "../api";
import { dayLabel, labelGroup, type LabelGroup } from "../lib/format";
import EventCard from "./EventCard";
import EventPanel from "./EventPanel";

type Filter = "all" | LabelGroup;

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "person", label: "People" },
  { id: "car", label: "Cars" },
  { id: "animal", label: "Animals" },
];

export default function EventsView() {
  const [events, setEvents] = useState<EventItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
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

  const groups = useMemo(() => {
    const shown = (events ?? []).filter((e) => filter === "all" || labelGroup(e.label) === filter);
    const byDay = new Map<string, EventItem[]>();
    for (const e of shown) {
      const key = dayLabel(e.startTime);
      byDay.set(key, [...(byDay.get(key) ?? []), e]);
    }
    return [...byDay.entries()];
  }, [events, filter]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`rounded-full border px-4 py-1.5 text-sm backdrop-blur-xl ${
              filter === f.id ? "border-white/30 bg-white/20" : "border-white/15 bg-white/5 hover:bg-white/15"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-3xl border border-rose-400/30 bg-rose-500/10 p-5 backdrop-blur-xl">
          <p className="font-medium">Couldn't load events</p>
          <p className="mt-1 text-sm text-white/70">{error}</p>
        </div>
      )}

      {!events && !error && <p className="text-white/50">Loading…</p>}
      {events && groups.length === 0 && <p className="text-white/50">No events yet.</p>}

      {groups.map(([day, items]) => (
        <section key={day} className="flex flex-col gap-3">
          <h2 className="text-sm font-medium uppercase tracking-wide text-white/50">{day}</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((e) => (
              <EventCard key={e.id} event={e} onOpen={() => setOpen(e)} />
            ))}
          </div>
        </section>
      ))}

      {open && <EventPanel event={open} onClose={close} />}
    </div>
  );
}
