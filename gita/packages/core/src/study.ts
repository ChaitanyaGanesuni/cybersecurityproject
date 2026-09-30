import type { VerseRef } from "@gita/contracts";
import { ContentRepository } from "./repository.js";
import type { Highlight, Note, UserState } from "./progress.js";

const parseKey = (key: string): VerseRef => {
  const [c, v] = key.split(".");
  return { chapterNumber: Number(c), verseNumber: Number(v) };
};

export function notesForVerse(user: UserState, verseKey: string): Note[] {
  return user.notes
    .filter((n) => n.verseKey === verseKey)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function highlightForVerse(user: UserState, verseKey: string): Highlight | null {
  return user.highlights.find((h) => h.verseKey === verseKey) ?? null;
}

/** One row in "My Gita" — a verse the user has engaged with, and how. */
export interface LibraryEntry {
  ref: VerseRef;
  key: string;
  snippet: string;
  bookmarked: boolean;
  highlighted: boolean;
  understood: boolean;
  forRevision: boolean;
  noteCount: number;
}

export interface MyGitaViewModel {
  entries: LibraryEntry[];
  counts: {
    bookmarks: number;
    notes: number;
    highlights: number;
    understood: number;
    forRevision: number;
  };
}

/** Aggregate everything the user has personally touched into "My Gita" (spec §17). */
export function buildMyGita(repo: ContentRepository, user: UserState): MyGitaViewModel {
  const keys = new Set<string>([
    ...user.bookmarks,
    ...user.highlights.map((h) => h.verseKey),
    ...user.notes.map((n) => n.verseKey),
    ...user.understood,
    ...user.forRevision,
  ]);

  const entries: LibraryEntry[] = [...keys]
    .map((key) => {
      const ref = parseKey(key);
      const verse = repo.getVerse(ref);
      const tr = verse ? repo.translationFor(verse, "en") : null;
      const snippet = tr?.text.slice(0, 120) ?? "";
      return {
        ref,
        key,
        snippet,
        bookmarked: user.bookmarks.includes(key),
        highlighted: user.highlights.some((h) => h.verseKey === key),
        understood: user.understood.includes(key),
        forRevision: user.forRevision.includes(key),
        noteCount: user.notes.filter((n) => n.verseKey === key).length,
      };
    })
    .sort(
      (a, b) =>
        a.ref.chapterNumber - b.ref.chapterNumber || a.ref.verseNumber - b.ref.verseNumber,
    );

  return {
    entries,
    counts: {
      bookmarks: user.bookmarks.length,
      notes: user.notes.length,
      highlights: user.highlights.length,
      understood: user.understood.length,
      forRevision: user.forRevision.length,
    },
  };
}
