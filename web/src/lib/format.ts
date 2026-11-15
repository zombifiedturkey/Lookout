import type { EventItem } from "../api";

export type LabelGroup = "person" | "car" | "animal" | "other";

export function labelGroup(label: string): LabelGroup {
  if (label === "person") return "person";
  if (label === "car") return "car";
  if (label === "dog" || label === "cat") return "animal";
  return "other";
}

export const GROUP_STYLES: Record<LabelGroup, { name: string; dot: string }> = {
  person: { name: "Person", dot: "bg-sky-400" },
  car: { name: "Car", dot: "bg-amber-400" },
  animal: { name: "Animal", dot: "bg-emerald-400" },
  other: { name: "Other", dot: "bg-violet-400" },
};

export function eventTitle(e: EventItem): string {
  const g = labelGroup(e.label);
  if (g === "animal") return e.label.charAt(0).toUpperCase() + e.label.slice(1);
  return GROUP_STYLES[g].name === "Other" ? e.label : GROUP_STYLES[g].name;
}

export function timeOfDay(sec: number): string {
  return new Date(sec * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function dayLabel(sec: number): string {
  const d = new Date(sec * 1000);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "short" });
}

// "Today", "Yesterday" or a short date like "Mon 12 Nov", for tiles that have little room.
export function dayShort(sec: number): string {
  const d = dayLabel(sec);
  if (d === "Today" || d === "Yesterday") return d;
  return new Date(sec * 1000).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
}

export function duration(e: EventItem): string | null {
  if (e.endTime === null) return null;
  const s = Math.max(1, Math.round(e.endTime - e.startTime));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

export function timeAgo(sec: number): string {
  const diff = Math.max(0, Math.floor(Date.now() / 1000 - sec));
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function dateTime(sec: number): string {
  return new Date(sec * 1000).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function objectsTitle(objects: string[]): string {
  const first = objects[0];
  if (!first) return "Activity";
  const name = first.charAt(0).toUpperCase() + first.slice(1);
  return objects.length > 1 ? `${name} +${objects.length - 1}` : name;
}
