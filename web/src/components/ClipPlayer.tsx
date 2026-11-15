import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { saveClip } from "../api";
import { PopupMaximised } from "./Popup";
import TrimBar, { MIN_TRIM } from "./TrimBar";

// Describes the clip so it can be saved with a useful name. Leave out to hide the editor (e.g. for already-saved clips).
export interface SaveTarget {
  kind: "review" | "event";
  id: string;
  camera: string;
  cameraLabel: string;
  label: string;
  recordedAt: number; // unix seconds when the clip starts
  defaultName: string;
}

interface Props {
  src: string;
  poster?: string;
  onError: () => void;
  save?: SaveTarget;
}

const SPEEDS = [1, 2, 0.5];

function clock(sec: number, tenths = false): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const whole = Math.floor(sec);
  const base = `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
  return tenths ? `${base}.${Math.floor((sec - whole) * 10)}` : base;
}

const btn =
  "rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-sm tabular-nums hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-sky-400 outline-none disabled:opacity-40 disabled:hover:bg-white/10";

// Video player with a scrub bar and, when `save` is given, an edit bar to trim the clip and save the part you keep.
// Keys: Space play/pause, ←/→ jump 5 s, I / O set the trim start / end at the playhead.
export default function ClipPlayer({ src, poster, onError, save }: Props) {
  // The editor only shows in the maximised pop-up; the small one is just a player.
  const editing = useContext(PopupMaximised) && !!save;
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const trimReady = useRef(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [previewing, setPreviewing] = useState(false);
  const [name, setName] = useState(save?.defaultName ?? "");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const seekable = Number.isFinite(duration) && duration > 0;

  const toggle = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => undefined);
    else v.pause();
  }, []);

  const seekTo = useCallback((t: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = t;
    setTime(t);
  }, []);

  const skip = useCallback((delta: number) => {
    const v = videoRef.current;
    if (!v) return;
    const max = Number.isFinite(v.duration) ? v.duration : Infinity;
    seekTo(Math.min(max, Math.max(0, v.currentTime + delta)));
  }, [seekTo]);

  const markStart = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    setTrimStart(Math.max(0, Math.min(v.currentTime, trimEnd - MIN_TRIM)));
  }, [trimEnd]);

  const markEnd = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    setTrimEnd(Math.min(Number.isFinite(v.duration) ? v.duration : v.currentTime, Math.max(v.currentTime, trimStart + MIN_TRIM)));
  }, [trimStart]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "TEXTAREA" || (target.tagName === "INPUT" && (target as HTMLInputElement).type === "text")) return;
      if (e.key === " ") {
        e.preventDefault();
        toggle();
      } else if (e.key === "ArrowRight") skip(5);
      else if (e.key === "ArrowLeft") skip(-5);
      else if (editing && seekable && (e.key === "i" || e.key === "I")) markStart();
      else if (editing && seekable && (e.key === "o" || e.key === "O")) markEnd();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, skip, markStart, markEnd, editing, seekable]);

  // While previewing the selection, stop exactly at the trim end.
  useEffect(() => {
    if (!previewing) return;
    let raf = 0;
    const tick = () => {
      const v = videoRef.current;
      if (v && v.currentTime >= trimEnd) {
        v.pause();
        v.currentTime = trimEnd;
        setTime(trimEnd);
        setPreviewing(false);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [previewing, trimEnd]);

  const onDuration = (d: number) => {
    setDuration(d);
    if (Number.isFinite(d) && d > 0 && !trimReady.current) {
      trimReady.current = true;
      setTrimStart(0);
      setTrimEnd(d);
    }
  };

  const preview = () => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = trimStart;
    setPreviewing(true);
    void v.play().catch(() => setPreviewing(false));
  };

  const resetTrim = () => {
    setTrimStart(0);
    setTrimEnd(duration);
    setSaveMsg(null);
  };

  const cycleSpeed = () => {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    setSpeed(next);
    if (videoRef.current) videoRef.current.playbackRate = next;
  };

  const fullscreen = () => {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  };

  const doSave = async () => {
    if (!save) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      await saveClip({
        kind: save.kind,
        id: save.id,
        start: trimStart,
        end: trimEnd,
        name: name.trim() || save.defaultName,
        camera: save.camera,
        cameraLabel: save.cameraLabel,
        label: save.label,
        recordedAt: save.recordedAt,
      });
      setSaveMsg({ ok: true, text: "Saved. You'll find it in the Saved tab." });
    } catch (e) {
      setSaveMsg({ ok: false, text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const keepLen = Math.max(0, trimEnd - trimStart);
  const trimmed = seekable && (trimStart > 0.05 || trimEnd < duration - 0.05);

  return (
    <div ref={wrapRef} className="flex h-full min-h-0 flex-col bg-black">
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        autoPlay
        playsInline
        onClick={toggle}
        onError={onError}
        onPlay={() => setPlaying(true)}
        onPause={() => {
          setPlaying(false);
          setPreviewing(false);
        }}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => onDuration(e.currentTarget.duration)}
        onDurationChange={(e) => onDuration(e.currentTarget.duration)}
        className="min-h-0 w-full flex-1 cursor-pointer bg-black object-contain"
      />

      <div className="flex max-h-[55%] shrink-0 flex-col gap-3 overflow-y-auto border-t border-white/10 bg-white/5 px-4 py-3">
        <input
          type="range"
          aria-label="Seek"
          min={0}
          max={seekable ? duration : 1}
          step={0.05}
          value={seekable ? Math.min(time, duration) : 0}
          disabled={!seekable}
          onChange={(e) => seekTo(Number(e.target.value))}
          className="h-2 w-full shrink-0 cursor-pointer accent-sky-400 disabled:cursor-default disabled:opacity-40"
        />
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={btn} onClick={toggle} aria-label={playing ? "Pause" : "Play"}>
            {playing ? "❚❚ Pause" : "▶ Play"}
          </button>
          <button type="button" className={btn} onClick={() => skip(-5)} aria-label="Back 5 seconds">
            −5s
          </button>
          <button type="button" className={btn} onClick={() => skip(5)} aria-label="Forward 5 seconds">
            +5s
          </button>
          <span className="px-1 text-sm tabular-nums text-white/70">
            {clock(time)} / {seekable ? clock(duration) : "--:--"}
          </span>
          <div className="ml-auto flex gap-2">
            <button type="button" className={btn} onClick={cycleSpeed} aria-label="Playback speed">
              {speed}×
            </button>
            <button type="button" className={btn} onClick={fullscreen} aria-label="Fullscreen">
              ⛶
            </button>
          </div>
        </div>

        {editing && seekable && (
          <div className="flex flex-col gap-3 border-t border-white/10 pt-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="font-medium">Trim</span>
              <span className="tabular-nums text-white/70">
                {clock(trimStart, true)} → {clock(trimEnd, true)} · keeps {keepLen.toFixed(1)}s
              </span>
            </div>
            <TrimBar duration={duration} time={time} start={trimStart} end={trimEnd} onChange={(s, e) => { setTrimStart(s); setTrimEnd(e); }} onSeek={seekTo} />
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={btn} onClick={markStart} title="Set start at playhead (I)">
                [ Set start
              </button>
              <button type="button" className={btn} onClick={markEnd} title="Set end at playhead (O)">
                Set end ]
              </button>
              <button type="button" className={btn} onClick={preview}>
                ▶ Preview
              </button>
              <button type="button" className={btn} onClick={resetTrim} disabled={!trimmed}>
                Reset
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={name}
                maxLength={120}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name this clip"
                aria-label="Clip name"
                className="min-w-0 flex-1 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-sm outline-none placeholder:text-white/40 focus:border-white/40"
              />
              <button
                type="button"
                className="rounded-full border border-sky-400/50 bg-sky-500/30 px-5 py-1.5 text-sm font-medium hover:bg-sky-500/50 disabled:opacity-50"
                onClick={() => void doSave()}
                disabled={saving}
              >
                {saving ? "Saving…" : "Save clip"}
              </button>
            </div>
            {saveMsg && <p className={`text-sm ${saveMsg.ok ? "text-emerald-300" : "text-rose-200"}`}>{saveMsg.text}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
