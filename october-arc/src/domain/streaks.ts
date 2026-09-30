// Streak calculation.
//
// Rules:
//  - A category streak counts consecutive days on which that category reached
//    its configured minimum target (progress >= 100%).
//  - The overall streak counts consecutive "success" days (see scoring.ts),
//    plus any day the user explicitly protected with a Streak Protection.
//  - Today never breaks a streak while it is still in progress: if today is
//    not yet complete the streak is "alive" from yesterday and today is "at risk".
//  - Breaking a streak never deletes anything; we keep previous and longest.

import type { DayEval, Habit, ScoreKey } from './types';
import { SCORE_KEYS } from './types';
import { addDays } from './dates';
import { habitApplies } from './scoring';

export interface StreakInfo {
  current: number;
  longest: number;
  /** Length of the streak that ended most recently before the current one. */
  previous: number;
  todayDone: boolean;
  /** Current > 0 and today isn't done yet. */
  atRisk: boolean;
}

/**
 * @param dates ascending list of dates from the start of tracking through today (inclusive)
 * @param done  whether each date counts toward this streak
 */
export function computeStreak(dates: string[], done: (date: string) => boolean): StreakInfo {
  if (dates.length === 0) return { current: 0, longest: 0, previous: 0, todayDone: false, atRisk: false };
  const today = dates[dates.length - 1];
  const todayDone = done(today);

  const runs: number[] = [];
  let run = 0;
  // Past days (exclude today, which may still be in progress).
  for (let i = 0; i < dates.length - 1; i++) {
    if (done(dates[i])) run++;
    else {
      if (run > 0) runs.push(run);
      run = 0;
      runs.push(0); // marks a break
    }
  }
  const aliveFromYesterday = run;
  const current = aliveFromYesterday + (todayDone ? 1 : 0);

  const completedRuns = runs.filter((r) => r > 0);
  const previous = completedRuns.length ? completedRuns[completedRuns.length - 1] : 0;
  const longest = Math.max(current, ...completedRuns, 0);

  return { current, longest, previous, todayDone, atRisk: !todayDone && aliveFromYesterday > 0 };
}

export interface AllStreaks {
  overall: StreakInfo;
  categories: Record<ScoreKey, StreakInfo>;
  habits: Record<string, StreakInfo>;
}

export function computeAllStreaks(
  dates: string[],
  evals: Map<string, DayEval>,
  protectedDates: Set<string>,
  habits: Habit[],
): AllStreaks {
  const overall = computeStreak(dates, (d) => !!evals.get(d)?.success || protectedDates.has(d));
  const categories = {} as Record<ScoreKey, StreakInfo>;
  for (const k of SCORE_KEYS) categories[k] = computeStreak(dates, (d) => !!evals.get(d)?.complete[k]);
  const habitStreaks: Record<string, StreakInfo> = {};
  for (const h of habits) {
    const hDates = dates.filter((d) => habitApplies(h, d));
    habitStreaks[h.id] = computeStreak(hDates, (d) => !!evals.get(d)?.habitComplete[h.id]);
  }
  return { overall, categories, habits: habitStreaks };
}

/**
 * The most recent past day a protection could rescue: the last missed day
 * before today, provided there was a streak running into it. Returns null when
 * nothing needs protecting. Protection is never applied automatically.
 */
export function protectableDate(
  dates: string[],
  evals: Map<string, DayEval>,
  protectedDates: Set<string>,
): string | null {
  const today = dates[dates.length - 1];
  const yesterday = addDays(today, -1);
  const ok = (d: string) => !!evals.get(d)?.success || protectedDates.has(d);
  // Only offer for yesterday: protection is for quick recovery, not rewriting history.
  if (!dates.includes(yesterday) || ok(yesterday)) return null;
  const dayBefore = addDays(yesterday, -1);
  if (!dates.includes(dayBefore) || !ok(dayBefore)) return null;
  return yesterday;
}
