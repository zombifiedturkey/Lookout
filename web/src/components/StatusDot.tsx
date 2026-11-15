import type { SnapshotStatus } from "../hooks/useSnapshot";

const COLOURS: Record<SnapshotStatus, string> = {
  live: "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]",
  connecting: "bg-amber-400",
  offline: "bg-rose-500",
};

export default function StatusDot({ status }: { status: SnapshotStatus }) {
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${COLOURS[status]}`} title={status} />;
}
