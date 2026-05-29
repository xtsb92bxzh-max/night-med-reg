import type { GameState } from "./types";

const STORAGE_KEY = "night-med-reg:save";
// Bump when the GameState shape changes so stale saves are discarded rather
// than restored into an incompatible engine.
const SAVE_VERSION = 1;

interface SaveEnvelope {
  version: number;
  state: GameState;
}

function storage(): Storage | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    // Access to localStorage can throw in private-mode / sandboxed contexts.
    return null;
  }
}

/** Persist the current run. Finished runs are not saved (nothing to resume). */
export function saveGame(state: GameState): void {
  const store = storage();
  if (!store) return;
  if (state.ended) {
    clearGame();
    return;
  }
  try {
    const envelope: SaveEnvelope = { version: SAVE_VERSION, state };
    store.setItem(STORAGE_KEY, JSON.stringify(envelope));
  } catch {
    // Quota or serialization failure: a missing save is acceptable.
  }
}

/**
 * Load a resumable run, or null when there is nothing valid to restore.
 * Corrupt JSON, version mismatches, and finished runs all return null.
 */
export function loadGame(): GameState | null {
  const store = storage();
  if (!store) return null;
  const raw = store.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const envelope = JSON.parse(raw) as Partial<SaveEnvelope>;
    if (
      !envelope ||
      envelope.version !== SAVE_VERSION ||
      typeof envelope.state !== "object" ||
      envelope.state === null
    ) {
      return null;
    }
    const state = envelope.state as GameState;
    // A finished or structurally broken save is not resumable.
    if (state.ended || typeof state.minute !== "number") return null;
    return state;
  } catch {
    return null;
  }
}

/** Remove any stored run (used on restart and after a run ends). */
export function clearGame(): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(STORAGE_KEY);
  } catch {
    // Ignore: nothing more we can do.
  }
}
