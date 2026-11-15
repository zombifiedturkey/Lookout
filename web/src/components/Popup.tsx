import { useEffect, useState } from "react";
import type { ReactNode } from "react";

interface Props {
  title: ReactNode;
  subtitle: ReactNode;
  onClose: () => void;
  actions?: ReactNode; // extra buttons shown before Maximise / Close
  children: ReactNode;
}

const KEY = "lookout_popup_max";

const headerBtn = "rounded-full border border-white/15 bg-white/10 px-4 py-1.5 text-sm hover:bg-white/20 outline-none focus-visible:ring-2 focus-visible:ring-sky-400";

// The glass pop-up used for clips. "Maximise" makes it nearly fill the window (small gap to the edge); the choice is remembered.
export default function Popup({ title, subtitle, onClose, actions, children }: Props) {
  const [max, setMax] = useState(() => {
    try {
      return localStorage.getItem(KEY) === "1";
    } catch {
      return false;
    }
  });

  const toggle = () => {
    setMax((m) => {
      try {
        localStorage.setItem(KEY, m ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !m;
    });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.fullscreenElement) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md ${max ? "p-2" : "p-3 sm:p-8"}`}
      onClick={onClose}
    >
      <div
        className={`flex w-full flex-col overflow-hidden rounded-3xl border border-white/15 bg-white/10 shadow-2xl shadow-black/60 backdrop-blur-2xl ${
          max ? "h-full max-w-none" : "h-[min(92dvh,58rem)] max-w-5xl"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-5 py-3">
          <div className="min-w-0">
            <div className="truncate text-lg font-semibold">{title}</div>
            <div className="truncate text-sm text-white/60">{subtitle}</div>
          </div>
          <div className="flex items-center gap-2">
            {actions}
            <button type="button" onClick={toggle} className={headerBtn} aria-label={max ? "Restore size" : "Maximise"} title={max ? "Restore size" : "Maximise"}>
              {max ? "⤡ Restore" : "⤢ Maximise"}
            </button>
            <button type="button" onClick={onClose} className={headerBtn}>
              Close
            </button>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col bg-black/40">{children}</div>
      </div>
    </div>
  );
}
