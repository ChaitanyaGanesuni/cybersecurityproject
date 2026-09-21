import type { DisplayPrefs, LanguagePrefs } from "./prefs.js";
import type { UserState } from "./progress.js";
import { defaultDisplayPrefs, defaultLanguagePrefs } from "./prefs.js";
import { emptyUserState } from "./progress.js";

/**
 * Everything that must survive an app restart (spec §11, §17). Versioned so future migrations
 * are explicit.
 */
export interface PersistedState {
  version: 1;
  user: UserState;
  language: LanguagePrefs;
  display: DisplayPrefs;
}

export const defaultPersistedState: PersistedState = {
  version: 1,
  user: emptyUserState,
  language: defaultLanguagePrefs,
  display: defaultDisplayPrefs,
};

/**
 * Storage port. The RN app implements this over AsyncStorage/SQLite; tests use the in-memory
 * implementation below. Keeping it an interface means the persistence backend can change without
 * touching state logic.
 */
export interface StatePersistence {
  load(): Promise<PersistedState | null>;
  save(state: PersistedState): Promise<void>;
}

/** Merge a possibly-partial/older persisted blob onto defaults (forward-compatible hydration). */
export function hydrate(raw: unknown): PersistedState {
  if (!raw || typeof raw !== "object") return defaultPersistedState;
  const r = raw as Partial<PersistedState>;
  return {
    version: 1,
    user: { ...emptyUserState, ...(r.user ?? {}) },
    language: { ...defaultLanguagePrefs, ...(r.language ?? {}) },
    display: { ...defaultDisplayPrefs, ...(r.display ?? {}) },
  };
}

export class InMemoryPersistence implements StatePersistence {
  private blob: PersistedState | null = null;
  async load(): Promise<PersistedState | null> {
    return this.blob;
  }
  async save(state: PersistedState): Promise<void> {
    this.blob = state;
  }
}
