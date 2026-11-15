// Review items opened in this browser, remembered locally (Frigate is also told, but not every version accepts that).
const VIEWED_KEY = "lookout_viewed";

export function loadViewed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(VIEWED_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

export function saveViewed(ids: Set<string>) {
  try {
    localStorage.setItem(VIEWED_KEY, JSON.stringify([...ids].slice(-1000)));
  } catch {
    /* ignore */
  }
}
