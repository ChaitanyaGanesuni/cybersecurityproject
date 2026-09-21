import { create } from "zustand";
import {
  defaultDisplayPrefs,
  defaultLanguagePrefs,
  emptyUserState,
  type DisplayPrefs,
  type LanguagePrefs,
  type UserState,
} from "@gita/core";
import { verseTitle } from "@gita/core";

/**
 * App session state. In-memory for Phase 3; Phase 8 swaps the setters to persist to SQLite
 * (op-sqlite) and sync — the component API stays the same.
 */
interface Store {
  user: UserState;
  language: LanguagePrefs;
  display: DisplayPrefs;
  markRead: (chapterNumber: number, verseNumber: number) => void;
  toggleBookmark: (chapterNumber: number, verseNumber: number) => void;
  setLanguage: (patch: Partial<LanguagePrefs>) => void;
  setDisplay: (patch: Partial<DisplayPrefs>) => void;
}

export const useUserStore = create<Store>((set) => ({
  user: emptyUserState,
  language: defaultLanguagePrefs,
  display: defaultDisplayPrefs,

  markRead: (c, v) =>
    set((s) => {
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
    set((s) => {
      const key = verseTitle(c, v);
      const has = s.user.bookmarks.includes(key);
      return {
        user: {
          ...s.user,
          bookmarks: has
            ? s.user.bookmarks.filter((k) => k !== key)
            : [...s.user.bookmarks, key],
        },
      };
    }),

  setLanguage: (patch) => set((s) => ({ language: { ...s.language, ...patch } })),
  setDisplay: (patch) => set((s) => ({ display: { ...s.display, ...patch } })),
}));
