// App-wide derived state. Raw records come from IndexedDB through a live query;
// everything the UI shows (scores, streaks, nudges, risk) is derived here from
// the pure domain functions, so the UI never duplicates business rules.

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import { defaultSettings } from '../domain/defaults';
import { emptyRawDay, evaluateDay, type RawDay } from '../domain/scoring';
import { computeAllStreaks, protectableDate, type AllStreaks } from '../domain/streaks';
import { buildHistory, computeNudges, dayClock, riskSummary, type DayClock, type History, type Nudge, type RiskSummary } from '../domain/nudges';
import { addDays, dateRange, daysBetween, toISODate } from '../domain/dates';
import type {
  Arc, CheckIn, DayEval, DaySummary, Habit, Meal, MealTemplate, Settings, WeightEntry, Workout,
} from '../domain/types';

export interface AppState {
  settings: Settings;
  arc: Arc | null;
  arcs: Arc[];
  habits: Habit[];
  activeHabits: Habit[];
  now: Date;
  today: string;
  clock: DayClock;
  raw: Map<string, RawDay>;
  evals: Map<string, DayEval>;
  todayEval: DayEval;
  /** Arc days from start through today (or arc end), ascending. */
  arcDates: string[];
  /** Finished arc days (before today). */
  pastArcEvals: DayEval[];
  dayIndex: number;
  arcDays: number;
  arcEnded: boolean;
  arcNotStarted: boolean;
  streaks: AllStreaks;
  protectedDates: Set<string>;
  protectionsLeft: number;
  protectable: string | null;
  nudges: Nudge[];
  /** Patterns from the last 14 days, used by the reminder engine. */
  history: History;
  /** A streak is running into today (from yesterday). */
  streakAlive: boolean;
  risk: RiskSummary;
  checkins: Map<string, CheckIn>;
  meals: Meal[];
  templates: MealTemplate[];
  workouts: Workout[];
  weights: WeightEntry[];
}

const Ctx = createContext<AppState | null>(null);

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp outside provider');
  return v;
}

function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    const vis = () => document.visibilityState === 'visible' && setNow(new Date());
    document.addEventListener('visibilitychange', vis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', vis);
    };
  }, [intervalMs]);
  return now;
}

async function loadAll() {
  const [settings, arcs, water, steps, sleep, meals, templates, quality, workouts, habits, habitCompletions, weights, checkins, summaries, protections] =
    await Promise.all([
      db.settings.get('settings'),
      db.arcs.toArray(),
      db.water.toArray(),
      db.steps.toArray(),
      db.sleep.toArray(),
      db.meals.toArray(),
      db.mealTemplates.toArray(),
      db.quality.toArray(),
      db.workouts.toArray(),
      db.habits.orderBy('order').toArray(),
      db.habitCompletions.toArray(),
      db.weights.orderBy('date').toArray(),
      db.checkins.toArray(),
      db.summaries.toArray(),
      db.protections.toArray(),
    ]);
  return { settings, arcs, water, steps, sleep, meals, templates, quality, workouts, habits, habitCompletions, weights, checkins, summaries, protections };
}
type Loaded = Awaited<ReturnType<typeof loadAll>>;

function buildRaw(d: Loaded): { raw: Map<string, RawDay>; touched: Map<string, number> } {
  const raw = new Map<string, RawDay>();
  const touched = new Map<string, number>();
  const get = (date: string) => {
    let r = raw.get(date);
    if (!r) raw.set(date, (r = emptyRawDay(date)));
    return r;
  };
  const touch = (date: string, at: number) => touched.set(date, Math.max(touched.get(date) ?? 0, at));
  for (const x of d.water) { get(x.date).water.push(x); touch(x.date, x.updatedAt); }
  for (const x of d.steps) { get(x.date).steps = x; touch(x.date, x.updatedAt); }
  for (const x of d.sleep) { get(x.date).sleep = x; touch(x.date, x.updatedAt); }
  for (const x of d.meals) { get(x.date).meals.push(x); touch(x.date, x.updatedAt); }
  for (const x of d.quality) { get(x.date).quality = x; touch(x.date, x.updatedAt); }
  for (const x of d.workouts) { get(x.date).workouts.push(x); touch(x.date, x.updatedAt); }
  for (const x of d.habitCompletions) { get(x.date).habitCompletions.push(x); touch(x.date, x.updatedAt); }
  return { raw, touched };
}

export function AppProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const data = useLiveQuery(loadAll, []);
  const now = useNow();
  const today = toISODate(now);

  const state = useMemo<(AppState & { stale: DaySummary[] }) | null>(() => {
    if (!data) return null;
    const settings = data.settings ?? defaultSettings();
    const habits = data.habits;
    const arcs = [...data.arcs].sort((a, b) => a.startDate.localeCompare(b.startDate));
    const arc = [...arcs].reverse().find((a) => a.status === 'active') ?? null;
    const { raw, touched } = buildRaw(data);
    const summaries = new Map(data.summaries.map((s) => [s.date, s]));

    // Streak history spans all arcs, from the first arc's start through today.
    const first = arcs.length && arcs[0].startDate < today ? arcs[0].startDate : today;
    const dates = dateRange(first, today);
    const evals = new Map<string, DayEval>();
    const stale: DaySummary[] = [];
    for (const d of dates) {
      const r = raw.get(d) ?? emptyRawDay(d);
      const sum = summaries.get(d);
      if (d < today && sum && sum.updatedAt >= (touched.get(d) ?? 0)) {
        evals.set(d, sum.eval); // finalized snapshot
      } else {
        const e = evaluateDay(r, settings, habits);
        evals.set(d, e);
        if (d < today) stale.push({ id: d, date: d, updatedAt: Date.now(), eval: e });
      }
    }
    const todayEval = evals.get(today)!;

    const protectedDates = new Set(data.protections.map((p) => p.date));
    const streaks = computeAllStreaks(dates, evals, protectedDates, habits);
    const arcDates = arc && arc.startDate <= today ? dateRange(arc.startDate, today < arc.endDate ? today : arc.endDate) : [];
    const pastArcEvals = arcDates.filter((d) => d < today).map((d) => evals.get(d)!);
    const used = arc ? data.protections.filter((p) => p.arcId === arc.id).length : 0;
    const protectable = arc ? protectableDate(dates, evals, protectedDates) : null;

    const clock = dayClock(now, settings);
    const recent = dates.slice(-15, -1).map((d) => evals.get(d)!);
    const aliveFromYesterday = streaks.overall.current - (streaks.overall.todayDone ? 1 : 0);
    const activeHabits = habits.filter((h) => h.active);
    const history = buildHistory(recent);
    const nudges = computeNudges(todayEval, settings, activeHabits, clock, history, aliveFromYesterday > 0);
    const risk = riskSummary(todayEval, settings, aliveFromYesterday, clock);

    return {
      settings,
      arc,
      arcs,
      habits,
      activeHabits,
      now,
      today,
      clock,
      raw,
      evals,
      todayEval,
      arcDates,
      pastArcEvals,
      dayIndex: arc ? daysBetween(arc.startDate, today) + 1 : 0,
      arcDays: arc ? daysBetween(arc.startDate, arc.endDate) + 1 : 0,
      arcEnded: !!arc && today > arc.endDate,
      arcNotStarted: !!arc && today < arc.startDate,
      streaks,
      protectedDates,
      protectionsLeft: arc ? Math.max(0, arc.protectionsTotal - used) : 0,
      protectable: protectable && arc && protectable >= arc.startDate && used < arc.protectionsTotal ? protectable : null,
      nudges,
      history,
      streakAlive: aliveFromYesterday > 0,
      risk,
      checkins: new Map(data.checkins.map((c) => [c.date, c])),
      meals: data.meals,
      templates: data.templates,
      workouts: data.workouts,
      weights: data.weights,
      stale,
    };
  }, [data, now, today]);

  // End-of-day finalization: persist summaries for past days that are new or
  // were edited since. History is never deleted when a streak breaks.
  useEffect(() => {
    if (state?.stale.length) void db.summaries.bulkPut(state.stale);
  }, [state?.stale]);

  if (!state) return <>{fallback}</>;
  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export const yesterdayOf = (d: string) => addDays(d, -1);
