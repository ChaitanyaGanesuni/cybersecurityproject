import type { VerseRef } from "@gita/contracts";

/**
 * Daily practice (spec §19): Listen → Understand → Reflect → Apply → Journal, anchored to the
 * day's verse. Reflections are private. Pure state helpers; storage lives in the user state.
 */
export const DAILY_STEPS = ["listen", "understand", "reflect", "apply", "journal"] as const;
export type DailyStep = (typeof DAILY_STEPS)[number];

export interface DailyEntry {
  date: string; // YYYY-MM-DD
  verseKey: string;
  reflection: string;
  application: string;
  completedSteps: DailyStep[];
  updatedAt: string;
}

/** Local calendar date key (YYYY-MM-DD). */
export function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function findDailyEntry(entries: DailyEntry[], date: Date): DailyEntry | null {
  const k = dayKey(date);
  return entries.find((e) => e.date === k) ?? null;
}

export function emptyDailyEntry(verse: VerseRef, date: Date): DailyEntry {
  return {
    date: dayKey(date),
    verseKey: `${verse.chapterNumber}.${verse.verseNumber}`,
    reflection: "",
    application: "",
    completedSteps: [],
    updatedAt: date.toISOString(),
  };
}

export function withStep(entry: DailyEntry, step: DailyStep, now: Date): DailyEntry {
  if (entry.completedSteps.includes(step)) return entry;
  return { ...entry, completedSteps: [...entry.completedSteps, step], updatedAt: now.toISOString() };
}

export function isDailyComplete(entry: DailyEntry): boolean {
  return DAILY_STEPS.every((s) => entry.completedSteps.includes(s));
}
