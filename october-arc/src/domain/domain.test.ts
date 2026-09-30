import { describe, expect, it } from 'vitest';
import { defaultSettings } from './defaults';
import { emptyRawDay, evaluateDay, type RawDay } from './scoring';
import { computeStreak, computeAllStreaks, protectableDate } from './streaks';
import { computeNudges, dayClock, riskSummary, walkMinutes, nextAction } from './nudges';
import { dueNotifications, dueWaterReminder, inQuietHours, planSchedule } from './reminders';
import { pickNight } from './sleep';
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
    const base = { settings: s, clock, today: e, nudges, habits: [], sentToday: [], streak: 3, now: new Date(2026, 9, 12, 14, 40), lastDrinkAt: new Date(2026, 9, 12, 14, 0).getTime() };
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

describe('recurring water reminders', () => {
  const at = (h: number, m = 0) => new Date(2026, 9, 12, h, m);
  const setup = (ml: number, now: Date) => {
    const s = S();
    s.reminders.enabled = true;
    s.reminders.waterEveryMin = 120;
    const e = evaluateDay(day('2026-10-12', { water: ml }), s, []);
    return { settings: s, clock: dayClock(now, s), today: e, now };
  };
  const log = (type: string, t: Date) => ({ id: type, updatedAt: 0, date: '2026-10-12', type, scheduledAt: t.getTime(), sentAt: t.getTime(), status: 'sent' as const, title: '', body: '' });

  it('fires once the interval has passed since the last drink, with a pace-based amount', () => {
    const a = setup(1000, at(15));
    expect(dueWaterReminder({ ...a, lastDrinkAt: at(14).getTime(), sentToday: [] })).toBeNull(); // drank 1h ago
    const w = dueWaterReminder({ ...a, lastDrinkAt: at(12, 30).getTime(), sentToday: [] })!;
    expect(w.title).toBe('💧 Catch-up sip time'); // 1.0 L at 3 PM is behind pace
    expect(w.body).toMatch(/^1.0 L \/ 3.0 L\. Have about \d+ ml now to get back on pace\.$/);
    expect(w.tag).toBe('water');
    expect(w.actions?.[0]).toEqual({ action: 'water-add:250', title: '+250 ml' });
  });

  it('counts from wake-up when nothing is logged, and waits after any reminder', () => {
    const a = setup(0, at(8, 30)); // woke 07:00, 90 min ago
    expect(dueWaterReminder({ ...a, lastDrinkAt: null, sentToday: [] })).toBeNull();
    const b = setup(0, at(9, 5));
    expect(dueWaterReminder({ ...b, lastDrinkAt: null, sentToday: [] })).not.toBeNull();
    expect(dueWaterReminder({ ...b, lastDrinkAt: null, sentToday: [log('morning', at(8))] })).toBeNull();
  });

  it('stops when the goal is met, near bedtime, when off, and in quiet hours', () => {
    expect(dueWaterReminder({ ...setup(3000, at(15)), lastDrinkAt: null, sentToday: [] })).toBeNull();
    expect(dueWaterReminder({ ...setup(1000, at(22, 45)), lastDrinkAt: null, sentToday: [] })).toBeNull();
    const off = setup(1000, at(15));
    off.settings.reminders.waterEveryMin = null;
    expect(dueWaterReminder({ ...off, lastDrinkAt: null, sentToday: [] })).toBeNull();
    const q = setup(500, at(22, 40));
    q.settings.bedTime = '23:59';
    const nudges = computeNudges(q.today, q.settings, [], q.clock, { typicalWorkoutMin: null }, false);
    expect(dueNotifications({ ...q, nudges, habits: [], sentToday: [], streak: 0, lastDrinkAt: null })).toEqual([]);
  });

  it('suggests exactly what is left when that finishes the goal', () => {
    const w = dueWaterReminder({ ...setup(2800, at(20)), lastDrinkAt: at(17).getTime(), sentToday: [] })!;
    expect(w.body).toContain('Have about 200 ml now — that finishes today’s goal! 🎉');
  });

  it('is paced by its interval, not the daily cap, and never doubles up with a slot', () => {
    const a = setup(1000, at(16));
    const nudges = computeNudges(a.today, a.settings, [], a.clock, { typicalWorkoutMin: null }, false);
    const full = [log('morning', at(8)), log('afternoon', at(9)), log('evening', at(10)), log('night', at(11))];
    const due = dueNotifications({ ...a, nudges, habits: [], sentToday: full, streak: 0, lastDrinkAt: null });
    expect(due.map((d) => d.type)).toEqual(['water:16:00']);
    a.settings.reminders.afternoon = '16:00';
    const both = dueNotifications({ ...a, nudges, habits: [], sentToday: [], streak: 0, lastDrinkAt: null });
    expect(both.map((d) => d.type)).toEqual(['afternoon']);
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

describe('native schedule planning', () => {
  const at = (h: number, m = 0) => new Date(2026, 9, 12, h, m);
  const plan = (ml: number, now: Date, extra: Partial<Parameters<typeof planSchedule>[0]> = {}) => {
    const s = S();
    s.reminders.enabled = true;
    s.reminders.waterEveryMin = 120;
    const e = evaluateDay(day('2026-10-12', { water: ml }), s, []);
    return planSchedule({ settings: s, now, today: e, habits: [], history: { typicalWorkoutMin: null }, streakAlive: true, streak: 5, sentToday: [], lastDrinkAt: at(12).getTime(), ...extra });
  };
  const fmt = (xs: ReturnType<typeof planSchedule>) => xs.map((x) => `${x.date} ${String(x.at.getHours()).padStart(2, '0')}:${String(x.at.getMinutes()).padStart(2, '0')} ${x.n.type}`);

  it('lays out the rest of the day with the live rules, then the next mornings', () => {
    expect(fmt(plan(1200, at(12, 30)))).toEqual([
      '2026-10-12 14:00 water:14:00',
      '2026-10-12 14:30 afternoon',
      '2026-10-12 16:30 water:16:30',
      '2026-10-12 18:30 water:18:30',
      '2026-10-12 19:30 evening',
      '2026-10-12 21:30 night',
      '2026-10-13 08:00 morning',
      '2026-10-14 08:00 morning',
      '2026-10-15 08:00 morning',
    ]);
  });

  it('skips slots already delivered and water once the goal is met', () => {
    const delivered = [{ id: 'a', updatedAt: 0, date: '2026-10-12', type: 'afternoon', scheduledAt: at(14, 30).getTime(), sentAt: at(14, 30).getTime(), status: 'sent' as const, title: '', body: '' }];
    const out = fmt(plan(3000, at(15), { sentToday: delivered }));
    expect(out.filter((x) => x.includes('water') || x.includes('afternoon'))).toEqual([]);
    expect(out.slice(0, 2)).toEqual(['2026-10-12 19:30 evening', '2026-10-12 21:30 night']); // other goals still open
  });

  it('plans nothing when reminders are off', () => {
    const s = S();
    const e = evaluateDay(day('2026-10-12'), s, []);
    expect(planSchedule({ settings: s, now: at(9), today: e, habits: [], history: { typicalWorkoutMin: null }, streakAlive: false, streak: 0, sentToday: [], lastDrinkAt: null })).toEqual([]);
  });
});

describe('health import: last night from sleep sessions', () => {
  it('takes the longest session that ended this morning', () => {
    const iso = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).toISOString();
    expect(
      pickNight('2026-10-12', [
        { start: iso(11, 15), end: iso(11, 15, 40) }, // yesterday's nap
        { start: iso(11, 23, 20), end: iso(12, 6, 50) },
        { start: iso(12, 13), end: iso(12, 13, 30) }, // today's nap
      ]),
    ).toEqual({ bedtime: '23:20', wakeTime: '06:50' });
    expect(pickNight('2026-10-12', [])).toBeNull();
  });
});
