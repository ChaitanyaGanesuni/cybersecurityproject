import type { VerseRef } from "@gita/contracts";

/** Per-user reading progress: which verses have been read, and the last position. */
export interface ReadingProgress {
  readVerseKeys: string[]; // "2.14"
  lastReadVerse: VerseRef | null;
  lastReadAt: string | null; // ISO
}

/** Per-user listening progress (drives "Continue Listening" + resume). */
export interface ListeningProgress {
  chapterNumber: number;
  verseNumber: number;
  audioChunkId: string | null;
  positionSeconds: number;
  /** 0..1 fraction of the current chapter listened. */
  fraction: number;
  updatedAt: string; // ISO
}

/** A private, user-authored note attached to a verse. */
export interface Note {
  id: string;
  verseKey: string;
  text: string;
  createdAt: string;
  updatedAt: string;
}

export type HighlightColor = "saffron" | "green" | "blue";

export interface Highlight {
  id: string;
  verseKey: string;
  color: HighlightColor;
  createdAt: string;
}

export interface UserState {
  reading: ReadingProgress;
  listening: ListeningProgress | null;
  bookmarks: string[]; // verse keys
  notes: Note[];
  highlights: Highlight[];
  understood: string[]; // verse keys marked "understood"
  forRevision: string[]; // verse keys marked "for revision"
}

export const emptyUserState: UserState = {
  reading: { readVerseKeys: [], lastReadVerse: null, lastReadAt: null },
  listening: null,
  bookmarks: [],
  notes: [],
  highlights: [],
  understood: [],
  forRevision: [],
};

/** Count read verses within a given chapter. */
export function versesReadInChapter(
  reading: ReadingProgress,
  chapterNumber: number,
): number {
  const prefix = `${chapterNumber}.`;
  return reading.readVerseKeys.filter((k) => k.startsWith(prefix)).length;
}
