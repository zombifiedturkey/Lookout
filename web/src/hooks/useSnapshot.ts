import { useEffect, useRef, useState } from "react";
import { fetchSnapshot } from "../api";

export type SnapshotStatus = "connecting" | "live" | "offline";

// Polls a camera's snapshot. The next request only starts after the previous one
// finishes, so a slow network never piles up requests. Paused while the tab is hidden.
export function useSnapshot(name: string, height: number, intervalMs: number, active = true) {
  const [src, setSrc] = useState<string | null>(null);
  const [status, setStatus] = useState<SnapshotStatus>("connecting");
  const currentUrl = useRef<string | null>(null);

  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let timer: number | undefined;
    const ctrl = new AbortController();

    const schedule = () => {
      if (!stopped) timer = window.setTimeout(tick, intervalMs);
    };

    const tick = async () => {
      if (document.hidden) {
        schedule();
        return;
      }
      try {
        const blob = await fetchSnapshot(name, height, ctrl.signal);
        if (stopped) return;
        const url = URL.createObjectURL(blob);
        const old = currentUrl.current;
        currentUrl.current = url;
        setSrc(url);
        setStatus("live");
        if (old) window.setTimeout(() => URL.revokeObjectURL(old), 1000);
      } catch {
        if (stopped) return;
        setStatus("offline");
      }
      schedule();
    };

    tick();
    return () => {
      stopped = true;
      ctrl.abort();
      if (timer) window.clearTimeout(timer);
    };
  }, [name, height, intervalMs, active]);

  useEffect(
    () => () => {
      if (currentUrl.current) URL.revokeObjectURL(currentUrl.current);
    },
    [],
  );

  return { src, status };
}
