// Daily aggregation and scoring. Pure functions: raw records in, evaluation out.
//
// Rules (also documented in docs/ARCHITECTURE.md):
//  - Each category gets a progress value in 0..1 and is "complete" at 1.
//  - Daily score = weighted mean of progress over categories whose policy is
//    not "none" and whose weight > 0.
//  - A day is a streak "success" when every category with policy "breaks" is
//    complete AND the daily score is at least settings.minDayScore.

import { AVOID_FLAGS, SCORE_KEYS } from './types';
import type {
  DayEval,
  DayTotals,
  FoodQuality,
  Habit,
  HabitCompletion,
  Meal,
  ScoreKey,
  Settings,
  SleepEntry,
  StepsEntry,
  WaterEntry,
  Workout,
} from './types';

export interface RawDay {
  date: string;
  water: WaterEntry[];
  steps?: StepsEntry;
  sleep?: SleepEntry;
  meals: Meal[];
  quality?: FoodQuality;
  workouts: Workout[];
  habitCompletions: HabitCompletion[];
}

const EPS = 1e-9;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export function emptyRawDay(date: string): RawDay {
  return { date, water: [], meals: [], workouts: [], habitCompletions: [] };
}

export function aggregateDay(raw: RawDay): DayTotals {
  let calories = 0, protein = 0, carbs = 0, fat = 0, missing = 0;
  for (const meal of raw.meals) {
    for (const item of meal.items) {
      if (item.calories == null) missing++;
      calories += item.calories ?? 0;
      protein += item.protein ?? 0;
      carbs += item.carbs ?? 0;
      fat += item.fat ?? 0;
    }
  }
  const habits: Record<string, number> = {};
  for (const c of raw.habitCompletions) habits[c.habitId] = c.value;
  const starts = raw.workouts.map((w) => w.startTime).filter(Boolean).sort();
  return {
    waterMl: raw.water.reduce((s, w) => s + w.ml, 0),
    steps: raw.steps?.steps ?? 0,
    sleepMin: raw.sleep ? raw.sleep.minutes : null,
    exerciseMin: raw.workouts.reduce((s, w) => s + w.durationMin, 0),
    calories,
    protein,
    carbs,
    fat,
    mealsLogged: raw.meals.length,
    itemsMissingCalories: missing,
    flags: { ...(raw.quality?.flags ?? {}) },
    habits,
    firstWorkoutTime: starts[0] ?? null,
    bedtime: raw.sleep?.bedtime ?? null,
    wakeTime: raw.sleep?.wakeTime ?? null,
  };
}

export function habitApplies(h: Habit, date: string): boolean {
  if (h.createdDate > date) return false;
  if (h.archivedDate && date >= h.archivedDate) return false;
  return true;
}

/** Diet is a mix of whichever nutrition goals the user actually set. */
export function dietProgress(t: DayTotals, s: Settings): { progress: number; parts: DietPart[] } {
  const parts: DietPart[] = [];
  const g = s.goals;
  if (g.calories && g.calories > 0) {
    const upper = g.calories * (1 + g.calorieTolerancePct / 100);
    // A "full day logged" floor: 70% of target. Below that the day is simply
    // not fully logged yet — partial credit, never a penalty for under-eating.
    const floor = g.calories * 0.7;
    let p: number;
    if (t.calories <= 0) p = 0;
    else if (t.calories < floor) p = t.calories / floor;
    else if (t.calories <= upper) p = 1;
    else p = clamp01(1 - (t.calories - upper) / g.calories);
    parts.push({ key: 'calories', progress: p });
  }
  if (g.proteinG && g.proteinG > 0) {
    parts.push({ key: 'protein', progress: clamp01(t.protein / g.proteinG) });
  }
  for (const f of s.trackedFoodFlags) {
    if (AVOID_FLAGS.includes(f)) parts.push({ key: f, progress: t.flags[f] ? 0 : 1 });
  }
  if (parts.length === 0 || (!g.calories && !g.proteinG)) {
    // No numeric targets: logging at least one meal is the diet goal.
    parts.push({ key: 'logged', progress: t.mealsLogged > 0 ? 1 : 0 });
  }
  const progress = parts.reduce((a, p) => a + p.progress, 0) / parts.length;
  return { progress, parts };
}

export interface DietPart {
  key: string;
  progress: number;
}

export function evaluateDay(raw: RawDay, settings: Settings, habits: Habit[]): DayEval {
  const t = aggregateDay(raw);
  const g = settings.goals;
  const applicable = habits.filter((h) => habitApplies(h, raw.date));

  const habitComplete: Record<string, boolean> = {};
  for (const h of applicable) habitComplete[h.id] = (t.habits[h.id] ?? 0) >= h.target;

  const progress: Record<ScoreKey, number> = {
    water: clamp01(t.waterMl / Math.max(1, g.waterMl)),
    steps: clamp01(t.steps / Math.max(1, g.steps)),
    sleep: t.sleepMin == null ? 0 : clamp01(t.sleepMin / Math.max(1, g.sleepMin)),
    exercise: clamp01(t.exerciseMin / Math.max(1, g.exerciseMin)),
    diet: dietProgress(t, settings).progress,
    habits: applicable.length
      ? applicable.reduce((a, h) => a + clamp01((t.habits[h.id] ?? 0) / h.target), 0) /
        applicable.length
      : 0,
  };

  const complete = {} as Record<ScoreKey, boolean>;
  for (const k of SCORE_KEYS) complete[k] = progress[k] >= 1 - EPS;

  const isApplicable = (k: ScoreKey) => k !== 'habits' || applicable.length > 0;
  const scored = SCORE_KEYS.filter(
    (k) => isApplicable(k) && settings.policies[k] !== 'none' && settings.weights[k] > 0,
  );
  const wSum = scored.reduce((a, k) => a + settings.weights[k], 0);
  const score = wSum ? (100 * scored.reduce((a, k) => a + settings.weights[k] * progress[k], 0)) / wSum : 0;

  const breakers = SCORE_KEYS.filter((k) => isApplicable(k) && settings.policies[k] === 'breaks');
  const success = breakers.every((k) => complete[k]) && score >= settings.minDayScore - EPS;

  const hasData =
    raw.water.length > 0 ||
    !!raw.steps ||
    !!raw.sleep ||
    raw.meals.length > 0 ||
    raw.workouts.length > 0 ||
    raw.habitCompletions.length > 0;

  return { date: raw.date, totals: t, progress, complete, habitComplete, scored, score, success, hasData };
}

/** Keys that matter for the overall streak (policy "breaks"). */
export function breakingKeys(e: DayEval, s: Settings): ScoreKey[] {
  return SCORE_KEYS.filter(
    (k) => s.policies[k] === 'breaks' && (k !== 'habits' || Object.keys(e.habitComplete).length > 0),
  );
}

export type DayStatus = 'excellent' | 'partial' | 'missed' | 'future' | 'today' | 'protected' | 'before';

export function dayStatus(
  e: DayEval | undefined,
  date: string,
  today: string,
  protectedDates: Set<string>,
): DayStatus {
  if (date > today) return 'future';
  if (date === today) return e?.success ? 'excellent' : 'today';
  if (!e) return 'missed';
  if (e.success) return 'excellent';
  if (protectedDates.has(date)) return 'protected';
  return e.score >= 50 ? 'partial' : 'missed';
}
