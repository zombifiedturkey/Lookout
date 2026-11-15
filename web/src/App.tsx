import { useCallback, useEffect, useState } from "react";
import { checkSession, fetchCameras, logout, type Camera } from "./api";
import Login from "./components/Login";
import CameraTile from "./components/CameraTile";
import FullscreenView from "./components/FullscreenView";
import EventsView from "./components/EventsView";
import ReviewView from "./components/ReviewView";
import SavedView from "./components/SavedView";
import CameraStrip from "./components/CameraStrip";
import SettingsPanel from "./components/SettingsPanel";
import { loadWallpaper } from "./lib/settings";
import { usePageVisible } from "./hooks/usePageVisible";

export default function App() {
  const [auth, setAuth] = useState<"checking" | "needed" | "ok">("checking");
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    checkSession(ctrl.signal)
      .then((ok) => setAuth(ok ? "ok" : "needed"))
      .catch((e: Error) => {
        if (e.name !== "AbortError") setAuthError(e.message);
      });
    return () => ctrl.abort();
  }, []);

  if (authError) return <p className="p-8 text-rose-200">Couldn't reach Lookout: {authError}</p>;
  if (auth === "checking") return <p className="p-8 text-white/50">Loading…</p>;
  if (auth === "needed") return <Login onDone={() => setAuth("ok")} />;
  return <Main onSignOut={() => logout().then(() => setAuth("needed"))} />;
}

function Main({ onSignOut }: { onSignOut: () => void }) {
  const [cameras, setCameras] = useState<Camera[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [tab, setTab] = useState<"cameras" | "review" | "events" | "saved">("cameras");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const pageVisible = usePageVisible();

  // The wallpaper lives on the server, so it can only be asked for once signed in.
  useEffect(() => {
    const ctrl = new AbortController();
    void loadWallpaper(ctrl.signal);
    return () => ctrl.abort();
  }, []);

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
    <div className="flex min-h-full w-full flex-col gap-4 p-4 sm:gap-6 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3 sm:h-11 sm:flex-nowrap">
        <img src="/lookout-logo.png" alt="Lookout" className="h-9 w-auto select-none sm:h-11" draggable={false} />
        <nav className="flex flex-wrap justify-end gap-2">
          {(["cameras", "review", "events", "saved"] as const).map((t) => (
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
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Settings"
            title="Settings"
            className="grid h-[34px] w-[34px] place-items-center rounded-full border border-white/15 bg-white/5 text-white/80 backdrop-blur-xl hover:bg-white/15"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
              <circle cx="15" cy="7" r="2" />
              <circle cx="9" cy="17" r="2" />
            </svg>
          </button>
          <button
            type="button"
            onClick={onSignOut}
            className="rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-sm text-white/60 backdrop-blur-xl hover:bg-white/15"
          >
            Sign out
          </button>
        </nav>
      </header>

      {tab === "review" && <ReviewView />}
      {tab === "events" && <EventsView />}
      {tab === "saved" && <SavedView />}

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
        <div className="camera-page flex w-full flex-col gap-4 sm:gap-6">
          <CameraStrip />
          <main className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
            {cameras.map((c, i) => (
              <CameraTile key={c.name} camera={c} onOpen={() => setOpen(i)} liveActive={pageVisible && open === null} />
            ))}
          </main>
        </div>
      )}

      {tab === "cameras" && cameras && open !== null && (
        <FullscreenView cameras={cameras} index={open} onChange={setOpen} onClose={close} />
      )}

      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
