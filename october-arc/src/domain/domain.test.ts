import { describe, expect, it } from 'vitest';
import { defaultSettings } from './defaults';
import { emptyRawDay, evaluateDay, type RawDay } from './scoring';
import { computeStreak, computeAllStreaks, protectableDate } from './streaks';
import { computeNudges, dayClock, riskSummary, walkMinutes, nextAction } from './nudges';
import { dueNotifications, inQuietHours } from './reminders';
import { arcScore, insights, sleepStats } from './analytics';
import { dateRange, sleepMinutes, addDays } from './dates';
import { localAnswer, MEDICAL_NOTE, type AssistantContext } from './assistant';
import type { DayEval, Habit, Settings } from './types';

const S = (): Settings => ({ ...defaultSettings(), onboarded: true });

function day(date: string, o: { water?: number; steps?: number; sleep?: number; ex?: number; meals?: number; bed?: string; exStart?: string } = {}): RawDay {
  const r = emptyRawDay(date);
  if (o.water) r.water.push({ id: 'w' + date, updatedAt: 0, date, ml: o.water, at: 0 });
  if (o.steps != null) r.steps = { id: date, updatedAt: 0, date, steps: o.steps, source: 'manual' };
  if (o.sleep != null) r.sleep = { id: date, updatedAt: 0, date, bedtime: o.bed ?? '23:00', wakeTime: '07:00', minutes: o.sleep };
  if (o.ex) r.workouts.push({ id: 'x' + date, updatedAt: 0, date, type: 'walking', durationMin: o.ex, startTime: o.exStart ?? '18:00' });
  for (let i = 0; i < (o.meals ?? 0); i++) r.meals.push({ id: `m${i}${date}`, updatedAt: 0, date, mealType: 'lunch', items: [{ name: 'Dal', quantity: '1 bowl' }], at: 0 });
  return r;
}
const perfect = (date: string) => day(date, { water: 3000, steps: 9000, sleep: 480, ex: 30, meals: 3 });

describe('scoring', () => {
  it('scores a perfect day at 100 and marks success', () => {
    const e = evaluateDay(perfect('2026-10-01'), S(), []);
    expect(e.score).toBe(100);
    expect(e.success).toBe(true);
  });

  it('a missing "breaks" category fails the day even with a high score', () => {
    const e = evaluateDay(day('2026-10-01', { water: 3000, steps: 9000, sleep: 480, ex: 0, meals: 3 }), S(), []);
    expect(e.score).toBe(80);
    expect(e.success).toBe(false);
  });

  it('a "none" policy category is ignored by score and streak', () => {
    const s = S();
    s.policies.exercise = 'none';
    const e = evaluateDay(day('2026-10-01', { water: 3000, steps: 9000, sleep: 480, meals: 1 }), s, []);
    expect(e.score).toBe(100);
    expect(e.success).toBe(true);
  });

  it('diet with calorie target: within band complete, over band partial, no invented values', () => {
    const s = S();
    s.goals.calories = 2000;
    s.trackedFoodFlags = [];
    const r = day('2026-10-01');
    r.meals.push({ id: 'm', updatedAt: 0, date: r.date, mealType: 'lunch', at: 0, items: [{ name: 'x', quantity: '1', calories: 1900 }, { name: 'unknown', quantity: '1' }] });
    const e = evaluateDay(r, s, []);
    expect(e.progress.diet).toBe(1);
    expect(e.totals.itemsMissingCalories).toBe(1);
    r.meals[0].items[0].calories = 2600; // 400 over the 2200 upper band
    expect(evaluateDay(r, s, []).progress.diet).toBeCloseTo(0.8);
  });

  it('habits only count from their creation date', () => {
    const s = S();
    s.weights.habits = 10;
    const h: Habit = { id: 'h1', updatedAt: 0, name: 'Read', emoji: '📖', target: 10, unit: 'pages', reminderTime: null, active: true, order: 0, createdDate: '2026-10-05' };
    expect(evaluateDay(perfect('2026-10-01'), s, [h]).scored).not.toContain('habits');
    const r = perfect('2026-10-06');
    r.habitCompletions.push({ id: 'h1:x', updatedAt: 0, habitId: 'h1', date: r.date, value: 5 });
    const e = evaluateDay(r, s, [h]);
    expect(e.progress.habits).toBe(0.5);
    expect(e.habitComplete.h1).toBe(false);
  });
});

describe('streaks', () => {
  const dates = dateRange('2026-10-01', '2026-10-10');
  it('counts current, previous and longest; today in progress keeps streak alive', () => {
    const done = new Set(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09']);
    const s = computeStreak(dates, (d) => done.has(d));
    expect(s.current).toBe(5);
    expect(s.previous).toBe(3);
    expect(s.longest).toBe(5);
    expect(s.atRisk).toBe(true);
    const s2 = computeStreak(dates, (d) => done.has(d) || d === '2026-10-10');
    expect(s2.current).toBe(6);
    expect(s2.atRisk).toBe(false);
  });

  it('breaking keeps previous and longest', () => {
    const done = new Set(dateRange('2026-10-01', '2026-10-08'));
    const s = computeStreak(dates, (d) => done.has(d)); // 10-09 missed, 10-10 today pending
    expect(s.current).toBe(0);
    expect(s.previous).toBe(8);
    expect(s.longest).toBe(8);
  });

  it('protection rescues the overall streak but only when explicitly used', () => {
    const settings = S();
    const evals = new Map<string, DayEval>();
    for (const d of dates.slice(0, 8)) evals.set(d, evaluateDay(perfect(d), settings, []));
    evals.set('2026-10-09', evaluateDay(day('2026-10-09'), settings, []));
    evals.set('2026-10-10', evaluateDay(day('2026-10-10'), settings, []));
    const none = new Set<string>();
    expect(protectableDate(dates, evals, none)).toBe('2026-10-09');
    expect(computeAllStreaks(dates, evals, none, []).overall.current).toBe(0);
    const prot = new Set(['2026-10-09']);
    expect(computeAllStreaks(dates, evals, prot, []).overall.current).toBe(9);
    expect(protectableDate(dates, evals, prot)).toBeNull();
    // category streaks are not affected by protection
    expect(computeAllStreaks(dates, evals, prot, []).categories.water.current).toBe(0);
  });
});

describe('nudges', () => {
  const at = (h: number, m = 0) => new Date(2026, 9, 12, h, m);

  it('water behind at 6 PM gives a concrete plan', () => {
    const s = S();
    const e = evaluateDay(day('2026-10-12', { water: 1200 }), s, []);
    const n = computeNudges(e, s, [], dayClock(at(18), s), { typicalWorkoutMin: null }, true);
    const w = n.find((x) => x.key === 'water')!;
    expect(w.title).toMatch(/behind/);
    expect(w.body).toContain('1.8 L remaining');
    expect(w.body).toMatch(/500 ml now/);
    expect(w.level).toBe('risk');
  });

  it('steps at 8 PM suggest a walk sized to what remains', () => {
    const s = S();
    const e = evaluateDay(day('2026-10-12', { steps: 5200 }), s, []);
    const n = computeNudges(e, s, [], dayClock(at(20), s), { typicalWorkoutMin: null }, true);
    const st = n.find((x) => x.key === 'steps')!;
    expect(st.title).toBe('2,800 steps remaining');
    expect(st.body).toMatch(/25–30 minute walk/);
    expect(walkMinutes(1450)).toEqual([15, 20]);
  });

  it('never uses shaming words', () => {
    const s = S();
    const e = evaluateDay(day('2026-10-12'), s, []);
    const n = computeNudges(e, s, [], dayClock(at(21), s), { typicalWorkoutMin: 17 * 60 }, true);
    const all = n.map((x) => x.title + x.body).join(' ').toLowerCase();
    expect(all).not.toMatch(/fail|lazy|bad|should have|disappoint/);
    expect(nextAction(n)).not.toBeNull();
  });

  it('risk summary explains what saves the streak', () => {
    const s = S();
    const e = evaluateDay(day('2026-10-12', { water: 3000, steps: 9000, sleep: 480, meals: 2 }), s, []);
    const r = riskSummary(e, s, 12, dayClock(at(19), s));
    expect(r.atRisk).toBe(true);
    expect(r.missing).toEqual(['exercise']);
    expect(r.detail).toBe('Complete a workout today to keep your 12-day streak.');
  });
});

describe('reminders', () => {
  it('respects enabled flag, quiet hours, one-per-slot and daily max', () => {
    const s = S();
    const e = evaluateDay(day('2026-10-12', { water: 1400 }), s, []);
    const clock = dayClock(new Date(2026, 9, 12, 14, 40), s);
    const nudges = computeNudges(e, s, [], clock, { typicalWorkoutMin: null }, true);
    const base = { settings: s, clock, today: e, nudges, habits: [], sentToday: [], streak: 3 };
    expect(dueNotifications(base)).toEqual([]);
    s.reminders.enabled = true;
    const due = dueNotifications(base);
    expect(due).toHaveLength(1);
    expect(due[0].title).toBe('💧 Hydration check');
    expect(due[0].body).toContain('1.4 L / 3.0 L');
    const sent = [{ id: '1', updatedAt: 0, date: '2026-10-12', type: 'afternoon', scheduledAt: 0, sentAt: 0, status: 'sent' as const, title: '', body: '' }];
    expect(dueNotifications({ ...base, sentToday: sent })).toEqual([]);
    expect(inQuietHours(23 * 60, s.reminders)).toBe(true);
    expect(inQuietHours(12 * 60, s.reminders)).toBe(false);
  });
});

describe('analytics', () => {
  it('sleep stats handle bedtimes across midnight', () => {
    expect(sleepMinutes('23:30', '07:00')).toBe(450);
    const s = S();
    const evals = ['23:30', '00:30', '23:45'].map((b, i) => evaluateDay(day(addDays('2026-10-01', i), { sleep: 420, bed: b }), s, []));
    const st = sleepStats(evals, 450);
    expect(st.avgBedtime).toBe('23:55');
    expect(st.debtMin).toBe(90);
  });

  it('arc score uses weights; insights need enough data', () => {
    const s = S();
    const evals = dateRange('2026-10-01', '2026-10-07').map((d) => evaluateDay(day(d, { water: 3000, steps: 4000, sleep: 480, ex: 30, meals: 1 }), s, []));
    const a = arcScore(evals, s);
    expect(Math.round(a.score)).toBe(90);
    expect(insights(evals.slice(0, 2), s)).toEqual([]);
    expect(insights(evals, s)[0]).toMatch(/out of the last 7 days/);
  });
});

describe('assistant', () => {
  it('declines medical questions and answers data questions', () => {
    const s = S();
    const e = evaluateDay(day('2026-10-12', { water: 1800 }), s, []);
    const ctx: AssistantContext = {
      settings: s, habits: [], arcName: 'October Arc', dayIndex: 12, arcDays: 31, today: e, past: [],
      streaks: computeAllStreaks(['2026-10-12'], new Map([['2026-10-12', e]]), new Set(), []),
      nudges: computeNudges(e, s, [], dayClock(new Date(2026, 9, 12, 15), s), { typicalWorkoutMin: null }, false),
      protectedDates: [], protectionsLeft: 2, todayMeals: [],
    };
    expect(localAnswer('I have chest pain when running', ctx)).toBe(MEDICAL_NOTE);
    expect(localAnswer('How much water do I have left?', ctx)).toContain('1.2 L left');
  });
});
