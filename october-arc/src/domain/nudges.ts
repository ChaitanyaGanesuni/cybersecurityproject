// The accountability engine. Given "now" and today's progress it works out:
// what is done -> what remains -> how much time is left -> whether the streak
// is at risk -> the smallest realistic next action.
//
// Language rules: supportive, specific, never shaming. Every message offers a
// concrete next step sized to the time that is left.

import type { DayEval, Habit, ScoreKey, Settings } from './types';
import { hm, minutesToHM } from './dates';
import { fmtDuration, fmtInt, fmtLiters, fmtTime12, roundTo } from './format';
import { dietProgress } from './scoring';

export type NudgeLevel = 'done' | 'info' | 'behind' | 'risk';

export interface Nudge {
  key: ScoreKey | `habit:${string}`;
  level: NudgeLevel;
  emoji: string;
  title: string;
  body: string;
  action?: { label: string; href: string };
  /** Rough effort in minutes for the suggested next step (for "what next"). */
  effortMin: number;
}

export interface DayClock {
  /** Minutes since midnight now. */
  nowMin: number;
  /** 0..1 fraction of the user's waking day that has passed. */
  dayFraction: number;
  /** Minutes until the user's usual bedtime (>= 0). */
  minutesLeft: number;
}

export function dayClock(now: Date, s: Settings): DayClock {
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const wake = hm(s.wakeTime);
  let bed = hm(s.bedTime);
  if (bed <= wake) bed += 1440;
  let n = nowMin;
  if (n < wake && nowMin + 1440 <= bed) n += 1440; // after midnight, before bedtime
  const dayFraction = Math.max(0, Math.min(1, (n - wake) / (bed - wake)));
  return { nowMin, dayFraction, minutesLeft: Math.max(0, bed - n) };
}

export interface History {
  /** Typical workout start time (minutes of day), from the user's own logs. */
  typicalWorkoutMin: number | null;
}

export function buildHistory(recent: DayEval[]): History {
  const starts = recent
    .map((e) => e.totals.firstWorkoutTime)
    .filter((t): t is string => !!t)
    .map(hm)
    .sort((a, b) => a - b);
  return { typicalWorkoutMin: starts.length >= 3 ? starts[Math.floor(starts.length / 2)] : null };
}

/** Walking cadence assumption: ~90–110 steps per minute. */
export function walkMinutes(steps: number): [number, number] {
  const lo = roundTo(steps / 110, 5);
  const hi = Math.max(lo + 5, roundTo(steps / 90, 5));
  return [lo, hi];
}

export function computeNudges(
  e: DayEval,
  s: Settings,
  habits: Habit[],
  clock: DayClock,
  history: History,
  streakAlive: boolean,
): Nudge[] {
  const out: Nudge[] = [];
  const g = s.goals;
  const t = e.totals;
  const hoursLeft = clock.minutesLeft / 60;
  const late = clock.dayFraction >= 0.6;
  const levelFor = (k: ScoreKey, behind: boolean): NudgeLevel =>
    s.policies[k] === 'breaks' && late && streakAlive ? 'risk' : behind ? 'behind' : 'info';
  const active = (k: ScoreKey) => s.policies[k] !== 'none';

  // 💧 Water
  if (active('water')) {
    const remaining = Math.max(0, g.waterMl - t.waterMl);
    if (remaining === 0) {
      out.push({ key: 'water', level: 'done', emoji: '💧', title: 'Hydration goal complete', body: `${fmtLiters(t.waterMl)} today. Nicely done.`, effortMin: 0 });
    } else {
      const expected = g.waterMl * clock.dayFraction;
      const behind = t.waterMl < expected - 250;
      const hoursForPlan = Math.max(1, Math.floor(hoursLeft));
      const perHour = roundTo(remaining / hoursForPlan, 50);
      const first = Math.min(500, remaining);
      const rest = remaining - first;
      let plan: string;
      if (rest <= 0) plan = `One ${first} ml glass finishes it.`;
      else if (hoursForPlan <= 1) plan = `Try ${first} ml now and the remaining ${rest} ml over the next hour.`;
      else plan = `Try ${first} ml now, then about ${Math.min(perHour, rest)} ml per hour.`;
      out.push({
        key: 'water',
        level: levelFor('water', behind),
        emoji: '💧',
        title: behind ? "You're a little behind today's hydration pace" : `${fmtLiters(remaining)} to go`,
        body: `You're at ${fmtLiters(t.waterMl)} / ${fmtLiters(g.waterMl)}. ${fmtLiters(remaining)} remaining${
          clock.minutesLeft > 0 ? ` with about ${fmtDuration(clock.minutesLeft)} before bedtime` : ''
        }. ${plan}`,
        action: { label: `+${first} ml`, href: `#/today/water?add=${first}` },
        effortMin: 1,
      });
    }
  }

  // 🚶 Steps
  if (active('steps')) {
    const remaining = Math.max(0, g.steps - t.steps);
    if (remaining === 0) {
      out.push({ key: 'steps', level: 'done', emoji: '🚶', title: 'Step goal complete', body: `${fmtInt(t.steps)} steps today.`, effortMin: 0 });
    } else {
      const [lo, hi] = walkMinutes(remaining);
      const behind = t.steps < g.steps * clock.dayFraction - 1000;
      const fits = lo <= clock.minutesLeft;
      out.push({
        key: 'steps',
        level: levelFor('steps', behind),
        emoji: '🚶',
        title: `${fmtInt(remaining)} steps remaining`,
        body: fits
          ? `A ${lo}–${hi} minute walk could get you there.${remaining <= 2000 ? " You're close." : ''}`
          : `Every bit counts — a ${Math.min(lo, 15)}-minute walk still moves today forward.`,
        action: { label: 'Update steps', href: '#/today/steps' },
        effortMin: lo,
      });
    }
  }

  // 🏃 Exercise
  if (active('exercise')) {
    const remaining = Math.max(0, g.exerciseMin - t.exerciseMin);
    if (remaining === 0) {
      out.push({ key: 'exercise', level: 'done', emoji: '🏃', title: 'Workout complete', body: `${fmtDuration(t.exerciseMin)} of exercise logged.`, effortMin: 0 });
    } else {
      const habit =
        history.typicalWorkoutMin != null && history.typicalWorkoutMin > clock.nowMin
          ? ` You usually work out around ${fmtTime12(minutesToHM(history.typicalWorkoutMin))}.`
          : '';
      out.push({
        key: 'exercise',
        level: levelFor('exercise', clock.dayFraction > 0.5),
        emoji: '🏃',
        title: t.exerciseMin === 0 ? "You haven't logged today's workout yet" : `${remaining} more minutes of exercise`,
        body:
          t.exerciseMin === 0
            ? `Even a short ${Math.min(15, remaining)}-minute workout can move today's progress forward.${habit}`
            : `You've done ${fmtDuration(t.exerciseMin)}. ${remaining} more minutes reaches your ${g.exerciseMin}-minute goal — a brisk walk counts.${habit}`,
        action: { label: 'Log workout', href: '#/today/exercise' },
        effortMin: Math.min(15, remaining),
      });
    }
  }

  // 😴 Sleep: last night's sleep belongs to today. In the evening, protect tomorrow.
  if (active('sleep')) {
    if (t.sleepMin == null) {
      out.push({
        key: 'sleep',
        level: levelFor('sleep', false),
        emoji: '😴',
        title: "Log last night's sleep",
        body: 'Add your bedtime and wake-up time — it takes a few seconds.',
        action: { label: 'Log sleep', href: '#/today/sleep' },
        effortMin: 1,
      });
    } else if (t.sleepMin >= g.sleepMin) {
      out.push({ key: 'sleep', level: 'done', emoji: '😴', title: 'Sleep target met', body: `${fmtDuration(t.sleepMin)} last night.`, effortMin: 0 });
    } else {
      out.push({
        key: 'sleep',
        level: 'info',
        emoji: '😴',
        title: `${fmtDuration(t.sleepMin)} last night`,
        body: `${fmtDuration(g.sleepMin - t.sleepMin)} under your target. An earlier wind-down tonight helps tomorrow.`,
        effortMin: 0,
      });
    }
    const idealBed = hm(s.wakeTime) - g.sleepMin;
    const untilBed = ((idealBed - clock.nowMin) % 1440 + 1440) % 1440;
    if (clock.dayFraction > 0.7 && untilBed <= 60) {
      out.push({
        key: 'sleep',
        level: 'info',
        emoji: '🌙',
        title: "Protect tomorrow's streak",
        body: `To get ${fmtDuration(g.sleepMin)} before your usual ${fmtTime12(s.wakeTime)} wake-up, aim to be in bed by ${fmtTime12(
          minutesToHM(idealBed),
        )}. Consider starting your bedtime routine now.`,
        effortMin: 0,
      });
    }
  }

  // 🍽️ Diet
  if (active('diet')) {
    const { parts, progress } = dietProgress(t, s);
    if (progress >= 1) {
      out.push({ key: 'diet', level: 'done', emoji: '🍽️', title: 'Diet on track', body: 'Your food goals are met for today.', effortMin: 0 });
    } else if (t.mealsLogged === 0) {
      out.push({
        key: 'diet',
        level: levelFor('diet', clock.dayFraction > 0.4),
        emoji: '🍽️',
        title: 'No meals logged yet',
        body: 'Log what you have eaten so far — quick-add makes it one tap.',
        action: { label: 'Log a meal', href: '#/food' },
        effortMin: 2,
      });
    } else {
      const bits: string[] = [];
      const protein = parts.find((p) => p.key === 'protein');
      if (protein && protein.progress < 1 && g.proteinG) {
        bits.push(`${Math.round(t.protein)} / ${g.proteinG} g protein — a protein-forward next meal (eggs, dal, paneer, yogurt, chicken, tofu) closes the gap`);
      }
      const cal = parts.find((p) => p.key === 'calories');
      if (cal && cal.progress < 1 && g.calories) {
        const upper = g.calories * (1 + g.calorieTolerancePct / 100);
        bits.push(
          t.calories > upper
            ? `a bit above today's calorie range — no problem, just keep the rest of today light and move on`
            : `${fmtInt(t.calories)} / ${fmtInt(g.calories)} kcal logged so far`,
        );
      }
      const avoided = parts.filter((p) => p.progress === 0 && !['protein', 'calories', 'logged'].includes(p.key));
      if (avoided.length) bits.push('today had a treat on your avoid list — tomorrow is a clean slate');
      out.push({
        key: 'diet',
        level: levelFor('diet', false),
        emoji: '🍽️',
        title: 'Diet in progress',
        body: bits.length ? cap(bits.join('; ')) + '.' : 'Keep logging your meals.',
        action: { label: 'Open food diary', href: '#/food' },
        effortMin: 2,
      });
    }
  }

  // ✅ Habits due now
  for (const h of habits) {
    if (!(h.id in e.habitComplete) || e.habitComplete[h.id]) continue;
    const due = h.reminderTime ? hm(h.reminderTime) <= clock.nowMin : clock.dayFraction > 0.75;
    if (!due) continue;
    out.push({
      key: `habit:${h.id}`,
      level: s.policies.habits === 'breaks' && late && streakAlive ? 'risk' : 'info',
      emoji: h.emoji,
      title: h.name,
      body: h.unit ? `${e.totals.habits[h.id] ?? 0} / ${h.target} ${h.unit} today.` : 'Still open for today.',
      action: { label: 'Check off', href: '#/today/habits' },
      effortMin: h.unit === 'min' ? h.target : 5,
    });
  }

  return out;
}

const rank: Record<NudgeLevel, number> = { risk: 0, behind: 1, info: 2, done: 3 };

/** Open items first, streak-critical first, then the smallest effort first. */
export function sortNudges(n: Nudge[]): Nudge[] {
  return [...n].sort((a, b) => rank[a.level] - rank[b.level] || a.effortMin - b.effortMin);
}

/** The single smallest realistic next action. */
export function nextAction(n: Nudge[]): Nudge | null {
  return sortNudges(n.filter((x) => x.level !== 'done' && x.action))[0] ?? null;
}

export interface RiskSummary {
  atRisk: boolean;
  missing: ScoreKey[];
  scoreShort: number; // points below the minimum day score, 0 if fine
  headline: string;
  detail: string;
}

/** Is today's overall streak at risk, and what exactly would save it? */
export function riskSummary(e: DayEval, s: Settings, streak: number, clock: DayClock): RiskSummary {
  const missing = (Object.keys(s.policies) as ScoreKey[]).filter(
    (k) => s.policies[k] === 'breaks' && (k !== 'habits' || Object.keys(e.habitComplete).length > 0) && !e.complete[k],
  );
  const scoreShort = Math.max(0, Math.ceil(s.minDayScore - e.score));
  if (e.success) {
    return { atRisk: false, missing: [], scoreShort: 0, headline: '🔥 Day complete!', detail: streak > 1 ? `Your ${streak}-day streak continues.` : 'Your streak is on.' };
  }
  const labels: Record<ScoreKey, string> = { water: 'your water', steps: 'your steps', sleep: 'sleep', exercise: 'a workout', diet: 'your diet goals', habits: 'your habits' };
  const need = missing.map((k) => labels[k]);
  const detail =
    (need.length ? `Complete ${joinList(need)} today` : `Add ${scoreShort} more points to today's score`) +
    (streak > 0 ? ` to keep your ${streak}-day streak.` : ' to start a new streak.');
  const atRisk = streak > 0 && clock.dayFraction >= 0.6;
  return {
    atRisk,
    missing,
    scoreShort,
    headline: atRisk ? '⚠️ Your streak is at risk' : streak > 0 ? '🔥 Your streak is still alive' : '🌱 Start a new streak today',
    detail,
  };
}

function joinList(xs: string[]): string {
  if (xs.length <= 1) return xs.join('');
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
