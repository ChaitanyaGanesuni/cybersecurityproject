/**
 * Spaced repetition (spec §18) using the SM-2 algorithm. Tracks *understanding* over time rather
 * than mere completion: each reviewed verse gets a next-due date that stretches as recall succeeds
 * (Day 1 → ~2 → ~4/6 → ...), and collapses back on a lapse. Pure and fully unit-testable.
 */

const DAY_MS = 86_400_000;

/** UI grades map onto SM-2 quality values 0–5. */
export type ReviewGrade = "again" | "hard" | "good" | "easy";
export const GRADE_QUALITY: Record<ReviewGrade, number> = { again: 2, hard: 3, good: 4, easy: 5 };

export interface RevisionItem {
  verseKey: string;
  /** SM-2 easiness factor (>= 1.3). */
  ease: number;
  intervalDays: number;
  repetitions: number;
  dueAt: string; // ISO
  lastReviewedAt: string | null;
  createdAt: string;
}

export function createRevisionItem(verseKey: string, now: Date): RevisionItem {
  return {
    verseKey,
    ease: 2.5,
    intervalDays: 0,
    repetitions: 0,
    dueAt: now.toISOString(), // due immediately on first add
    lastReviewedAt: null,
    createdAt: now.toISOString(),
  };
}

/** Apply an SM-2 review and return the updated item (does not mutate the input). */
export function reviewItem(item: RevisionItem, grade: ReviewGrade, now: Date): RevisionItem {
  const q = GRADE_QUALITY[grade];

  let { ease, intervalDays, repetitions } = item;

  if (q < 3) {
    // Lapse: reset the streak, review again soon.
    repetitions = 0;
    intervalDays = 1;
  } else {
    if (repetitions === 0) intervalDays = 1;
    else if (repetitions === 1) intervalDays = 6;
    else intervalDays = Math.round(intervalDays * ease);
    repetitions += 1;
  }

  // Standard SM-2 ease update, floored at 1.3.
  ease = Math.max(1.3, ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));

  return {
    ...item,
    ease: Number(ease.toFixed(4)),
    intervalDays,
    repetitions,
    lastReviewedAt: now.toISOString(),
    dueAt: new Date(now.getTime() + intervalDays * DAY_MS).toISOString(),
  };
}

/** Items due for review at `now`, soonest-due first. */
export function dueItems(items: RevisionItem[], now: Date): RevisionItem[] {
  const t = now.getTime();
  return items
    .filter((i) => new Date(i.dueAt).getTime() <= t)
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
}

export function nextDue(items: RevisionItem[]): RevisionItem | null {
  if (items.length === 0) return null;
  return [...items].sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())[0]!;
}
