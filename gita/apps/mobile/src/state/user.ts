import { create } from "zustand";
import {
  defaultDisplayPrefs,
  defaultLanguagePrefs,
  emptyUserState,
  verseTitle,
  type DisplayPrefs,
  type HighlightColor,
  type LanguagePrefs,
  type PersistedState,
  type UserState,
} from "@gita/core";
import { AsyncStoragePersistence } from "../data/persistence";

const persistence = new AsyncStoragePersistence();
const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const toggle = (list: string[], key: string): string[] =>
  list.includes(key) ? list.filter((k) => k !== key) : [...list, key];

interface Store {
  hydrated: boolean;
  user: UserState;
  language: LanguagePrefs;
  display: DisplayPrefs;

  init: () => Promise<void>;
  markRead: (c: number, v: number) => void;
  toggleBookmark: (c: number, v: number) => void;
  addNote: (c: number, v: number, text: string) => void;
  deleteNote: (id: string) => void;
  setHighlight: (c: number, v: number, color: HighlightColor | null) => void;
  toggleUnderstood: (c: number, v: number) => void;
  toggleForRevision: (c: number, v: number) => void;
  setLanguage: (patch: Partial<LanguagePrefs>) => void;
  setDisplay: (patch: Partial<DisplayPrefs>) => void;
}

export const useUserStore = create<Store>((set, get) => {
  // Persist whenever the persistable slice changes (after hydration).
  const persist = () => {
    const { hydrated, user, language, display } = get();
    if (!hydrated) return;
    const blob: PersistedState = { version: 1, user, language, display };
    void persistence.save(blob);
  };
  const update = (fn: (s: Store) => Partial<Store>) => {
    set(fn as never);
    persist();
  };

  return {
    hydrated: false,
    user: emptyUserState,
    language: defaultLanguagePrefs,
    display: defaultDisplayPrefs,

    init: async () => {
      const loaded = await persistence.load();
      if (loaded) {
        set({ user: loaded.user, language: loaded.language, display: loaded.display });
      }
      set({ hydrated: true });
    },

    markRead: (c, v) =>
      update((s) => {
        const key = verseTitle(c, v);
        const readVerseKeys = s.user.reading.readVerseKeys.includes(key)
          ? s.user.reading.readVerseKeys
          : [...s.user.reading.readVerseKeys, key];
        return {
          user: {
            ...s.user,
            reading: {
              readVerseKeys,
              lastReadVerse: { chapterNumber: c, verseNumber: v },
              lastReadAt: new Date().toISOString(),
            },
          },
        };
      }),

    toggleBookmark: (c, v) =>
      update((s) => ({ user: { ...s.user, bookmarks: toggle(s.user.bookmarks, verseTitle(c, v)) } })),

    addNote: (c, v, text) =>
      update((s) => {
        const now = new Date().toISOString();
        return {
          user: {
            ...s.user,
            notes: [
              ...s.user.notes,
              { id: newId(), verseKey: verseTitle(c, v), text: text.trim(), createdAt: now, updatedAt: now },
            ],
          },
        };
      }),

    deleteNote: (id) =>
      update((s) => ({ user: { ...s.user, notes: s.user.notes.filter((n) => n.id !== id) } })),

    setHighlight: (c, v, color) =>
      update((s) => {
        const key = verseTitle(c, v);
        const without = s.user.highlights.filter((h) => h.verseKey !== key);
        return {
          user: {
            ...s.user,
            highlights: color
              ? [...without, { id: newId(), verseKey: key, color, createdAt: new Date().toISOString() }]
              : without,
          },
        };
      }),

    toggleUnderstood: (c, v) =>
      update((s) => ({ user: { ...s.user, understood: toggle(s.user.understood, verseTitle(c, v)) } })),

    toggleForRevision: (c, v) =>
      update((s) => ({ user: { ...s.user, forRevision: toggle(s.user.forRevision, verseTitle(c, v)) } })),

    setLanguage: (patch) => update((s) => ({ language: { ...s.language, ...patch } })),
    setDisplay: (patch) => update((s) => ({ display: { ...s.display, ...patch } })),
  };
});
