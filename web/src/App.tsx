import { useCallback, useEffect, useState } from "react";
import { fetchCameras, type Camera } from "./api";
import CameraTile from "./components/CameraTile";
import FullscreenView from "./components/FullscreenView";
import EventsView from "./components/EventsView";

export default function App() {
  const [cameras, setCameras] = useState<Camera[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [tab, setTab] = useState<"cameras" | "events">("cameras");

  useEffect(() => {
    const ctrl = new AbortController();
    setError(null);
    fetchCameras(ctrl.signal)
      .then(setCameras)
      .catch((e: Error) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => ctrl.abort();
  }, [attempt]);

  const close = useCallback(() => setOpen(null), []);

  return (
    <div className="mx-auto flex min-h-full max-w-7xl flex-col gap-6 p-4 sm:p-8">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Lookout</h1>
        <nav className="flex gap-2">
          {(["cameras", "events"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-full border px-4 py-1.5 text-sm capitalize backdrop-blur-xl ${
                tab === t ? "border-white/30 bg-white/20" : "border-white/15 bg-white/5 hover:bg-white/15"
              }`}
            >
              {t}
            </button>
          ))}
        </nav>
      </header>

      {tab === "events" && <EventsView />}

      {tab === "cameras" && error && (
        <div className="rounded-3xl border border-rose-400/30 bg-rose-500/10 p-5 backdrop-blur-xl">
          <p className="font-medium">Couldn't load cameras</p>
          <p className="mt-1 text-sm text-white/70">{error}</p>
          <button
            type="button"
            onClick={() => setAttempt((n) => n + 1)}
            className="mt-3 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-sm hover:bg-white/20"
          >
            Try again
          </button>
        </div>
      )}

      {tab === "cameras" && !cameras && !error && <p className="text-white/50">Loading…</p>}

      {tab === "cameras" && cameras && (
        <main className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
          {cameras.map((c, i) => (
            <CameraTile key={c.name} camera={c} onOpen={() => setOpen(i)} />
          ))}
        </main>
      )}

      {tab === "cameras" && cameras && open !== null && (
        <FullscreenView cameras={cameras} index={open} onChange={setOpen} onClose={close} />
      )}
    </div>
  );
}
