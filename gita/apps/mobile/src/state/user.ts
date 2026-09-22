import { create } from "zustand";
import {
  createRevisionItem,
  defaultDisplayPrefs,
  defaultLanguagePrefs,
  emptyDailyEntry,
  emptyUserState,
  findDailyEntry,
  reviewItem,
  verseTitle,
  withStep,
  type DailyStep,
  type DisplayPrefs,
  type HighlightColor,
  type LanguagePrefs,
  type PersistedState,
  type ReviewGrade,
  type UserState,
} from "@gita/core";
import type { VerseRef } from "@gita/contracts";
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
  reviewRevision: (verseKey: string, grade: ReviewGrade) => void;
  updateDaily: (
    verse: VerseRef,
    patch: Partial<{ reflection: string; application: string; step: DailyStep }>,
  ) => void;
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

    // Marking a verse for revision also enrolls it in the SM-2 schedule (and un-enrolls on toggle-off).
    toggleForRevision: (c, v) =>
      update((s) => {
        const key = verseTitle(c, v);
        const has = s.user.forRevision.includes(key);
        const revisionItems = has
          ? s.user.revisionItems.filter((i) => i.verseKey !== key)
          : s.user.revisionItems.some((i) => i.verseKey === key)
            ? s.user.revisionItems
            : [...s.user.revisionItems, createRevisionItem(key, new Date())];
        return {
          user: { ...s.user, forRevision: toggle(s.user.forRevision, key), revisionItems },
        };
      }),

    reviewRevision: (verseKey, grade) =>
      update((s) => ({
        user: {
          ...s.user,
          revisionItems: s.user.revisionItems.map((i) =>
            i.verseKey === verseKey ? reviewItem(i, grade, new Date()) : i,
          ),
        },
      })),

    updateDaily: (verse, patch) =>
      update((s) => {
        const now = new Date();
        const base = findDailyEntry(s.user.dailyEntries, now) ?? emptyDailyEntry(verse, now);
        let entry = { ...base, updatedAt: now.toISOString() };
        if (patch.reflection !== undefined) entry.reflection = patch.reflection;
        if (patch.application !== undefined) entry.application = patch.application;
        if (patch.step) entry = withStep(entry, patch.step, now);
        const others = s.user.dailyEntries.filter((e) => e.date !== entry.date);
        return { user: { ...s.user, dailyEntries: [...others, entry] } };
      }),

    setLanguage: (patch) => update((s) => ({ language: { ...s.language, ...patch } })),
    setDisplay: (patch) => update((s) => ({ display: { ...s.display, ...patch } })),
  };
});
