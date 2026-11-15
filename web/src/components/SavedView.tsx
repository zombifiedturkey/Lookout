import { useCallback, useEffect, useState } from "react";
import { deleteSaved, fetchSaved, savedClipUrl, savedThumbUrl, type SavedClip } from "../api";
import { dateTime } from "../lib/format";
import ClipPlayer from "./ClipPlayer";
import Popup from "./Popup";

function bytes(n: number): string {
  return n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

function Card({ clip, onOpen }: { clip: SavedClip; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative aspect-video w-full overflow-hidden rounded-3xl border border-white/15 bg-white/5 text-left shadow-xl shadow-black/40 outline-none transition hover:border-white/30 focus-visible:ring-2 focus-visible:ring-sky-400"
    >
      <img src={savedThumbUrl(clip.id)} alt="" loading="lazy" className="h-full w-full object-cover" draggable={false} />
      <div className="absolute right-3 top-3 rounded-full border border-white/15 bg-black/35 px-2.5 py-1 text-xs tabular-nums backdrop-blur-xl">
        {clip.duration.toFixed(1)}s
      </div>
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-4 pb-3 pt-12">
        <div className="truncate text-sm font-medium">{clip.name}</div>
        <div className="text-xs text-white/65">
          {clip.cameraLabel ? `${clip.cameraLabel} · ` : ""}
          {dateTime(clip.recordedAt)}
        </div>
      </div>
    </button>
  );
}

export default function SavedView() {
  const [clips, setClips] = useState<SavedClip[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<SavedClip | null>(null);
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(() => {
    fetchSaved()
      .then((c) => {
        setClips(c);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const close = useCallback(() => {
    setOpen(null);
    setConfirming(false);
  }, []);

  const remove = async (clip: SavedClip) => {
    try {
      await deleteSaved(clip.id);
      close();
      load();
    } catch (e) {
      setError((e as Error).message);
      setConfirming(false);
    }
  };

  const actionBtn = "rounded-full border border-white/15 bg-white/10 px-4 py-1.5 text-sm hover:bg-white/20";

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      {error && (
        <div className="rounded-3xl border border-rose-400/30 bg-rose-500/10 p-5 backdrop-blur-xl">
          <p className="font-medium">Something went wrong</p>
          <p className="mt-1 text-sm text-white/70">{error}</p>
        </div>
      )}
      {!clips && !error && <p className="text-white/50">Loading…</p>}
      {clips && clips.length === 0 && (
        <p className="text-white/50">No saved clips yet. Open a clip in Review or Events, trim it, and press Save clip.</p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
        {(clips ?? []).map((c) => (
          <Card key={c.id} clip={c} onOpen={() => setOpen(c)} />
        ))}
      </div>

      {open && (
        <Popup
          onClose={close}
          title={open.name}
          subtitle={`${open.cameraLabel ? `${open.cameraLabel} · ` : ""}${dateTime(open.recordedAt)} · ${open.duration.toFixed(1)}s · ${bytes(open.size)}`}
          actions={
            <>
              <a href={savedClipUrl(open.id, true)} download className={actionBtn}>
                Download
              </a>
              {confirming ? (
                <button type="button" onClick={() => void remove(open)} className="rounded-full border border-rose-400/50 bg-rose-500/30 px-4 py-1.5 text-sm hover:bg-rose-500/50">
                  Really delete?
                </button>
              ) : (
                <button type="button" onClick={() => setConfirming(true)} className={actionBtn}>
                  Delete
                </button>
              )}
            </>
          }
        >
          <ClipPlayer key={open.id} src={savedClipUrl(open.id)} poster={savedThumbUrl(open.id)} onError={() => setError("This clip couldn't be played")} />
        </Popup>
      )}
    </div>
  );
}
