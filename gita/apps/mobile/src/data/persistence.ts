import AsyncStorage from "@react-native-async-storage/async-storage";
import { hydrate, type PersistedState, type StatePersistence } from "@gita/core";

const KEY = "gita.persisted.v1";

/** AsyncStorage-backed implementation of the core StatePersistence port. */
export class AsyncStoragePersistence implements StatePersistence {
  async load(): Promise<PersistedState | null> {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      if (!raw) return null;
      return hydrate(JSON.parse(raw)); // forward-compatible merge onto defaults
    } catch {
      return null; // corrupt/unavailable storage -> start clean rather than crash
    }
  }

  async save(state: PersistedState): Promise<void> {
    try {
      await AsyncStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      // best-effort; a failed write must not break the UI
    }
  }
}
