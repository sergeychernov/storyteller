const storageKey = "storyteller.soundtrack.pending";
/** A creator can only have so many renders in flight; the bound stops an abandoned request growing the list. */
const maximumPending = 20;

/**
 * Remembers which soundtrack the creator asked for so the "generated" event still fires when the render finishes
 * while the tab is closed or reloading. An in-memory ref reported nothing in that case, which quietly under-counted
 * every generation a creator did not sit and watch.
 */
export function rememberRequestedSoundtrack(id: string): void {
  write([...read().filter((pending) => pending !== id), id].slice(-maximumPending));
}

/** True once per requested render: the id is dropped, so restoring an already-reported soundtrack stays silent. */
export function takeRequestedSoundtrack(id: string): boolean {
  const pending = read();
  if (!pending.includes(id)) return false;
  write(pending.filter((candidate) => candidate !== id));
  return true;
}

function read(): string[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
    return Array.isArray(stored) ? stored.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

function write(pending: readonly string[]): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(pending));
  } catch {
    // A private window or blocked site data only costs the event, never the soundtrack.
  }
}
