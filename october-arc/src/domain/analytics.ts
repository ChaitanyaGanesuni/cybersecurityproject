// Analytics, insights and summaries — derived strictly from the user's own logs.
// If there isn't enough data for a statement, we don't make it.

import type { DayEval, Habit, ScoreKey, Settings } from './types';
import { SCORE_KEYS } from './types';
import { hm, minutesToHM } from './dates';
import { fmtDuration, fmtInt, fmtLiters, fmtTime12 } from './format';
import { CATEGORY_META } from './defaults';

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const sd = (xs: number[]) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};

/** Bedtimes wrap midnight; shift early-morning times so 23:30 and 00:30 are 60 min apart. */
const bedMinutes = (t: string) => {
  const m = hm(t);
  return m < 12 * 60 ? m + 1440 : m;
};

export interface SleepStats {
  nights: number;
  avgMin: number;
  debtMin: number;
  avgBedtime: string | null;
  avgWake: string | null;
  bedtimeSpreadMin: number | null;
  consistencyLabel: string | null;
}

export function sleepStats(evals: DayEval[], targetMin: number): SleepStats {
  const nights = evals.filter((e) => e.totals.sleepMin != null);
  const mins = nights.map((e) => e.totals.sleepMin!);
  const beds = nights.map((e) => e.totals.bedtime).filter((b): b is string => !!b).map(bedMinutes);
  const wakes = nights.map((e) => e.totals.wakeTime).filter((b): b is string => !!b).map(hm);
  const spread = beds.length >= 3 ? Math.round(sd(beds)) : null;
  return {
    nights: nights.length,
    avgMin: mean(mins),
    debtMin: mins.reduce((a, m) => a + Math.max(0, targetMin - m), 0),
    avgBedtime: beds.length ? minutesToHM(mean(beds)) : null,
    avgWake: wakes.length ? minutesToHM(mean(wakes)) : null,
    bedtimeSpreadMin: spread,
    consistencyLabel:
      spread == null ? null : spread <= 30 ? 'Very consistent' : spread <= 60 ? 'Fairly consistent' : 'Variable',
  };
}

export interface PeriodStats {
  days: number;
  loggedDays: number;
  totalSteps: number;
  avgSteps: number;
  totalWaterMl: number;
  avgWaterMl: number;
  avgSleepMin: number;
  exerciseDays: number;
  totalExerciseMin: number;
  dietDays: number;
  avgScore: number;
  completedDays: number;
  missedDays: number;
  completionRate: Record<ScoreKey, number>;
}

/** Stats over a set of evaluated days (typically past days, excluding an in-progress today). */
export function periodStats(evals: DayEval[]): PeriodStats {
  const logged = evals.filter((e) => e.hasData);
  const base = logged.length ? logged : [];
  const sleepN = evals.filter((e) => e.totals.sleepMin != null);
  const completionRate = {} as Record<ScoreKey, number>;
  for (const k of SCORE_KEYS) completionRate[k] = evals.length ? evals.filter((e) => e.complete[k]).length / evals.length : 0;
  const totalSteps = evals.reduce((a, e) => a + e.totals.steps, 0);
  const totalWater = evals.reduce((a, e) => a + e.totals.waterMl, 0);
  return {
    days: evals.length,
    loggedDays: logged.length,
    totalSteps,
    avgSteps: base.length ? totalSteps / base.length : 0,
    totalWaterMl: totalWater,
    avgWaterMl: base.length ? totalWater / base.length : 0,
    avgSleepMin: mean(sleepN.map((e) => e.totals.sleepMin!)),
    exerciseDays: evals.filter((e) => e.complete.exercise).length,
    totalExerciseMin: evals.reduce((a, e) => a + e.totals.exerciseMin, 0),
    dietDays: evals.filter((e) => e.complete.diet).length,
    avgScore: mean(evals.map((e) => e.score)),
    completedDays: evals.filter((e) => e.success).length,
    missedDays: evals.filter((e) => !e.success).length,
    completionRate,
  };
}

export interface ArcScore {
  score: number;
  breakdown: { key: ScoreKey; pct: number; weight: number }[];
}

/** October Arc Score: weighted mean of each category's average daily progress. */
export function arcScore(evals: DayEval[], s: Settings): ArcScore {
  const keys = SCORE_KEYS.filter(
    (k) => s.policies[k] !== 'none' && s.weights[k] > 0 && (k !== 'habits' || evals.some((e) => Object.keys(e.habitComplete).length)),
  );
  const breakdown = keys.map((k) => ({ key: k, pct: 100 * mean(evals.map((e) => e.progress[k])), weight: s.weights[k] }));
  const w = breakdown.reduce((a, b) => a + b.weight, 0);
  return { score: w ? breakdown.reduce((a, b) => a + b.pct * b.weight, 0) / w : 0, breakdown };
}

/**
 * Insights from the last 14 days of finished days (ascending order).
 * Each statement requires a minimum amount of data.
 */
export function insights(past: DayEval[], s: Settings): string[] {
  const out: string[] = [];
  const last7 = past.slice(-7);
  const prev7 = past.slice(-14, -7);
  if (last7.length >= 5) {
    const rates = (['water', 'steps', 'exercise', 'sleep', 'diet'] as const)
      .filter((k) => s.policies[k] !== 'none')
      .map((k) => ({ k, n: last7.filter((e) => e.complete[k]).length }));
    const best = [...rates].sort((a, b) => b.n - a.n)[0];
    if (best && best.n > 0) {
      out.push(`You completed your ${CATEGORY_META[best.k].label.toLowerCase()} target ${best.n} out of the last ${last7.length} days.`);
    }
    const worst = [...rates].sort((a, b) => a.n - b.n)[0];
    if (worst && worst !== best && worst.n < last7.length / 2) {
      out.push(`${CATEGORY_META[worst.k].label} has been the hardest goal lately (${worst.n}/${last7.length} days) — a good place to focus small wins.`);
    }
  }
  const stepDays = (xs: DayEval[]) => xs.filter((e) => e.totals.steps > 0);
  if (stepDays(last7).length >= 3 && stepDays(prev7).length >= 3) {
    const diff = mean(stepDays(last7).map((e) => e.totals.steps)) - mean(stepDays(prev7).map((e) => e.totals.steps));
    if (Math.abs(diff) >= 300) {
      out.push(
        diff > 0
          ? `Your average steps increased by ${fmtInt(diff)} this week.`
          : `Your average steps were ${fmtInt(-diff)} lower this week than last — a short daily walk can bring it back.`,
      );
    }
  }
  const spread = (xs: DayEval[]) => sleepStats(xs, s.goals.sleepMin).bedtimeSpreadMin;
  const a = spread(last7), b = spread(prev7);
  if (a != null && b != null && Math.abs(a - b) >= 10) {
    out.push(a < b ? 'Your sleep was more consistent this week than last week.' : 'Your bedtime varied more this week than last week.');
  }
  // Exercise timing: needs at least 3 workout days on each side of 7 PM.
  const workoutDays = past.filter((e) => e.totals.firstWorkoutTime);
  const early = workoutDays.filter((e) => hm(e.totals.firstWorkoutTime!) < 19 * 60);
  const lateW = workoutDays.filter((e) => hm(e.totals.firstWorkoutTime!) >= 19 * 60);
  if (early.length >= 3 && lateW.length >= 3) {
    const re = early.filter((e) => e.complete.exercise).length / early.length;
    const rl = lateW.filter((e) => e.complete.exercise).length / lateW.length;
    if (re - rl >= 0.2) out.push('You tend to complete your exercise goal more often when you exercise before 7 PM.');
    else if (rl - re >= 0.2) out.push('You tend to complete your exercise goal more often when you exercise in the evening.');
  }
  if (last7.length >= 5) {
    const waterAvg = mean(last7.map((e) => e.totals.waterMl));
    if (waterAvg > 0) out.push(`You averaged ${fmtLiters(waterAvg)} of water per day this week.`);
  }
  return out;
}

/** Short end-of-day reflection built from what actually happened. */
export function reflection(e: DayEval, s: Settings): string {
  const keys = e.scored.filter((k) => k !== 'habits');
  const done = keys.filter((k) => e.complete[k]);
  const open = keys.filter((k) => !e.complete[k]);
  const parts: string[] = [`You completed ${done.length} of ${keys.length} goals (score ${Math.round(e.score)}%).`];
  if (done.length) parts.push(`Wins: ${done.map((k) => CATEGORY_META[k].label.toLowerCase()).join(', ')}.`);
  if (open.length) {
    const gaps = open.map((k) => {
      const t = e.totals, g = s.goals;
      switch (k) {
        case 'water': return `water (${fmtLiters(Math.max(0, g.waterMl - t.waterMl))} short)`;
        case 'steps': return `steps (${fmtInt(Math.max(0, g.steps - t.steps))} short)`;
        case 'exercise': return `exercise (${Math.max(0, g.exerciseMin - t.exerciseMin)} min short)`;
        case 'sleep': return t.sleepMin == null ? 'sleep (not logged)' : `sleep (${fmtDuration(Math.max(0, g.sleepMin - t.sleepMin))} short)`;
        default: return 'diet';
      }
    });
    parts.push(`Tomorrow's opportunity: ${gaps.join(', ')}.`);
  } else {
    parts.push('Everything done — enjoy the rest of your evening.');
  }
  return parts.join(' ');
}

export interface HabitRate {
  id: string;
  label: string;
  rate: number;
  days: number;
}

/** Completion rate per category and per custom habit, for best/hardest. */
export function habitRates(evals: DayEval[], s: Settings, habits: Habit[]): HabitRate[] {
  const rows: HabitRate[] = [];
  for (const k of ['water', 'steps', 'sleep', 'exercise', 'diet'] as const) {
    if (s.policies[k] === 'none' || !evals.length) continue;
    rows.push({ id: k, label: `${CATEGORY_META[k].emoji} ${CATEGORY_META[k].label}`, rate: evals.filter((e) => e.complete[k]).length / evals.length, days: evals.length });
  }
  for (const h of habits) {
    const ds = evals.filter((e) => h.id in e.habitComplete);
    if (!ds.length) continue;
    rows.push({ id: h.id, label: `${h.emoji} ${h.name}`, rate: ds.filter((e) => e.habitComplete[h.id]).length / ds.length, days: ds.length });
  }
  return rows;
}

export interface ArcSummary {
  score: number;
  daysCompleted: number;
  days: number;
  longestStreak: number;
  stats: PeriodStats;
  sleep: SleepStats;
  best: HabitRate | null;
  hardest: HabitRate | null;
  protectionsUsed: number;
  text: string;
}

export function arcSummary(
  arcName: string,
  evals: DayEval[],
  s: Settings,
  habits: Habit[],
  longestStreak: number,
  protectionsUsed: number,
): ArcSummary {
  const stats = periodStats(evals);
  const sleep = sleepStats(evals, s.goals.sleepMin);
  const rates = habitRates(evals, s, habits).sort((a, b) => b.rate - a.rate);
  const best = rates[0] ?? null;
  const hardest = rates.length > 1 ? rates[rates.length - 1] : null;
  const score = arcScore(evals, s).score;
  const lines: string[] = [];
  lines.push(`Over ${evals.length} days you logged ${stats.loggedDays} and completed ${stats.completedDays} full days, with a longest streak of ${longestStreak}.`);
  if (stats.totalSteps > 0) lines.push(`You walked ${fmtInt(stats.totalSteps)} steps (about ${fmtInt(stats.avgSteps)} a day on logged days).`);
  if (stats.totalWaterMl > 0) lines.push(`You drank ${fmtLiters(stats.totalWaterMl)} of water in total.`);
  if (stats.totalExerciseMin > 0) lines.push(`You exercised for ${fmtDuration(stats.totalExerciseMin)} across ${stats.exerciseDays} goal-complete days.`);
  if (sleep.nights > 0) lines.push(`Average logged sleep was ${fmtDuration(sleep.avgMin)}${sleep.avgBedtime ? `, with a typical bedtime around ${fmtTime12(sleep.avgBedtime)}` : ''}.`);
  if (best) lines.push(`Your most reliable habit was ${best.label} (${Math.round(best.rate * 100)}% of days).`);
  if (hardest && hardest.rate < (best?.rate ?? 1)) lines.push(`${hardest.label} was the hardest (${Math.round(hardest.rate * 100)}%) — a natural focus for your next arc.`);
  if (protectionsUsed) lines.push(`You used ${protectionsUsed} recovery day${protectionsUsed > 1 ? 's' : ''} and kept going.`);
  return {
    score,
    daysCompleted: stats.completedDays,
    days: evals.length,
    longestStreak,
    stats,
    sleep,
    best,
    hardest,
    protectionsUsed,
    text: `${arcName}: ` + lines.join(' '),
  };
}
