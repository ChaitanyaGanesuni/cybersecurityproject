import type { Chapter, Verse } from "@gita/contracts";

const WORDS_PER_MIN_READ = 200;
const WORDS_PER_MIN_LISTEN = 130; // spoken narration is slower than silent reading

const countWords = (s: string | null | undefined): number =>
  s ? s.trim().split(/\s+/).filter(Boolean).length : 0;

/** Words available to read/listen for a verse (transliteration + translation + any explanation). */
export function verseWordCount(v: Verse): number {
  let n = countWords(v.transliteration.text);
  for (const t of v.translations) n += countWords(t.text);
  n += countWords(v.explanation?.text);
  return n;
}

export function chapterWordCount(verses: Verse[]): number {
  return verses.reduce((sum, v) => sum + verseWordCount(v), 0);
}

const minutes = (words: number, wpm: number): number =>
  Math.max(1, Math.round(words / wpm));

export const estimateReadingMinutes = (words: number): number =>
  minutes(words, WORDS_PER_MIN_READ);
export const estimateListeningMinutes = (words: number): number =>
  minutes(words, WORDS_PER_MIN_LISTEN);

export function formatMinutes(mins: number): string {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** e.g. "Chapter 2 — 14 of 72 verses" (spec §5). */
export function chapterProgressLabel(chapter: Chapter, versesRead: number): string {
  return `Chapter ${chapter.chapterNumber} — ${versesRead} of ${chapter.versesCount} verses`;
}

/** e.g. "Listening progress: 37%" (spec §5). */
export function listeningProgressLabel(fraction: number): string {
  const pct = Math.round(Math.min(1, Math.max(0, fraction)) * 100);
  return `Listening progress: ${pct}%`;
}

export const verseTitle = (chapterNumber: number, verseNumber: number): string =>
  `${chapterNumber}.${verseNumber}`;
