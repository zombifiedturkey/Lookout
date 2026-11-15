import { useEffect, useRef } from "react";
import { liveUrl } from "../api";

export type LiveState = "connecting" | "live" | "failed";

interface Props {
  camera: string;
  onState: (state: LiveState) => void;
  className?: string;
}

const CODECS = [
  "avc1.640029", "avc1.64002A", "avc1.640033", "hvc1.1.6.L153.B0", "mp4a.40.2", "mp4a.40.5", "flac", "opus",
];

type MseCtor = typeof MediaSource;

function getMse(): MseCtor | null {
  const w = window as unknown as { MediaSource?: MseCtor; ManagedMediaSource?: MseCtor };
  return w.MediaSource ?? w.ManagedMediaSource ?? null;
}

// Live video over MSE: Lookout tunnels a WebSocket to Frigate's go2rtc, which sends fragmented MP4.
// Calls onState("failed") if it cannot play, so the caller can fall back to still images.
export default function LiveVideo({ camera, onState, className }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stateRef = useRef(onState);
  stateRef.current = onState;

  useEffect(() => {
    const videoEl = videoRef.current;
    const mseCtor = getMse();
    if (!videoEl || !mseCtor) {
      stateRef.current("failed");
      return;
    }
    // re-declared with explicit types so TypeScript keeps them non-null inside the functions below
    const video: HTMLVideoElement = videoEl;
    const Mse: MseCtor = mseCtor;

    let disposed = false;
    let ws: WebSocket | null = null;
    let ms: MediaSource | null = null;
    let sb: SourceBuffer | null = null;
    let queue: ArrayBuffer[] = [];
    let retries = 0;
    let retryTimer = 0;
    let stallTimer = 0;
    let objectUrl = "";

    const supported = CODECS.filter((c) => Mse.isTypeSupported(`video/mp4; codecs="${c}"`)).join(",");

    const pump = () => {
      if (!sb || sb.updating || queue.length === 0 || !ms || ms.readyState !== "open") return;
      try {
        sb.appendBuffer(queue.shift() as ArrayBuffer);
      } catch {
        fail();
      }
    };

    const trim = () => {
      // keep a short back buffer so memory does not grow forever
      if (!sb || sb.updating || video.buffered.length === 0) return;
      const start = video.buffered.start(0);
      const end = video.buffered.end(video.buffered.length - 1);
      if (end - start > 20 && video.currentTime - start > 10) {
        try {
          sb.remove(start, video.currentTime - 5);
        } catch {
          /* ignore */
        }
      }
      // stay close to live: jump forward if we fell well behind
      if (end - video.currentTime > 3) video.currentTime = end - 0.5;
    };

    const cleanup = () => {
      window.clearTimeout(stallTimer);
      if (ws) {
        ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        ws = null;
      }
      queue = [];
      sb = null;
      ms = null;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        objectUrl = "";
      }
      video.removeAttribute("src");
      video.load();
    };

    const fail = () => {
      if (disposed) return;
      cleanup();
      if (retries < 2) {
        retries += 1;
        stateRef.current("connecting");
        retryTimer = window.setTimeout(start, 1500 * retries);
      } else {
        stateRef.current("failed");
      }
    };

    const armStall = () => {
      window.clearTimeout(stallTimer);
      stallTimer = window.setTimeout(fail, 10000); // no data for 10s
    };

    function start() {
      if (disposed) return;
      stateRef.current("connecting");
      ms = new Mse();
      objectUrl = URL.createObjectURL(ms as unknown as MediaSource);
      video.src = objectUrl;
      video.disableRemotePlayback = true;

      ms.addEventListener("sourceopen", () => {
        if (disposed || ws) return;
        URL.revokeObjectURL(objectUrl);
        objectUrl = "";
        ws = new WebSocket(liveUrl(camera));
        ws.binaryType = "arraybuffer";
        ws.onopen = () => {
          armStall();
          ws?.send(JSON.stringify({ type: "mse", value: supported }));
        };
        ws.onmessage = (ev) => {
          armStall();
          if (typeof ev.data === "string") {
            const msg = JSON.parse(ev.data) as { type: string; value: string };
            if (msg.type === "mse" && ms && !sb) {
              try {
                sb = ms.addSourceBuffer(msg.value);
                sb.mode = "segments";
                sb.addEventListener("updateend", () => {
                  pump();
                  trim();
                });
              } catch {
                fail();
              }
            }
            return;
          }
          queue.push(ev.data as ArrayBuffer);
          pump();
          if (video.paused) {
            video.play().catch(() => undefined);
          }
          if (video.readyState >= 2) {
            retries = 0;
            stateRef.current("live");
          }
        };
        ws.onerror = () => fail();
        ws.onclose = () => fail();
      });
    }

    const onPlaying = () => {
      retries = 0;
      stateRef.current("live");
    };
    video.addEventListener("playing", onPlaying);
    start();

    return () => {
      disposed = true;
      window.clearTimeout(retryTimer);
      video.removeEventListener("playing", onPlaying);
      cleanup();
    };
  }, [camera]);

  return <video ref={videoRef} className={className} autoPlay muted playsInline />;
}
