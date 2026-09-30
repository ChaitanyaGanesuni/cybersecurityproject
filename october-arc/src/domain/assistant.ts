// On-device assistant. Answers common questions straight from the user's logs,
// works offline, and never sends data anywhere. The optional cloud assistant
// (server/assistant.ts) receives the same compact context built here.

import type { DayEval, Habit, Settings } from './types';
import type { AllStreaks } from './streaks';
import type { Nudge } from './nudges';
import { CATEGORY_META } from './defaults';
import { arcSummary, periodStats, sleepStats } from './analytics';
import { fmtDuration, fmtInt, fmtLiters } from './format';
import { breakingKeys } from './scoring';

export interface AssistantContext {
  settings: Settings;
  habits: Habit[];
  arcName: string;
  dayIndex: number;
  arcDays: number;
  today: DayEval;
  /** Finished days of the current arc, ascending. */
  past: DayEval[];
  streaks: AllStreaks;
  nudges: Nudge[];
  protectedDates: string[];
  protectionsLeft: number;
  todayMeals: { mealType: string; items: string[] }[];
}

const MEDICAL =
  /\b(pain|injur|chest|dizz|faint|diagnos|medic(ine|ation)|prescri|pregnan|diabet|blood pressure|heart rate|eating disorder|bulimi|anorexi|symptom|disease|supplement dose|fast(ing)? for)\b/i;

export const MEDICAL_NOTE =
  "That's a question for a qualified professional — a doctor, registered dietitian or physiotherapist can look at your specific situation. I can help with your logged habits and general, non-medical routines.";

export function localAnswer(q: string, c: AssistantContext): string {
  const text = q.toLowerCase();
  if (MEDICAL.test(text)) return MEDICAL_NOTE;
  const g = c.settings.goals;
  const t = c.today.totals;
  const nudge = (k: string) => c.nudges.find((n) => n.key === k);

  if (/water|hydrat|drink/.test(text)) {
    const left = Math.max(0, g.waterMl - t.waterMl);
    if (!left) return `You've hit today's water goal: ${fmtLiters(t.waterMl)} / ${fmtLiters(g.waterMl)}. 🎉`;
    return `You're at ${fmtLiters(t.waterMl)} / ${fmtLiters(g.waterMl)} — ${fmtLiters(left)} left. ${nudge('water')?.body.split('. ').slice(-1)[0] ?? ''}`.trim();
  }
  if (/step|walk/.test(text) && !/workout/.test(text)) {
    const left = Math.max(0, g.steps - t.steps);
    if (!left) return `Step goal done: ${fmtInt(t.steps)} / ${fmtInt(g.steps)}. 🚶`;
    return `${fmtInt(t.steps)} / ${fmtInt(g.steps)} steps — ${fmtInt(left)} to go. ${nudge('steps')?.body ?? ''}`.trim();
  }
  if (/why.*(streak|break|broke)|streak.*(break|broke|lost)/.test(text)) return whyStreakBroke(c);
  if (/week|how did i (do|perform)/.test(text)) return weekSummary(c);
  if (/tomorrow|focus|improve/.test(text)) return focusTomorrow(c);
  if (/workout|exercise|routine|20.?min/.test(text)) return WORKOUT_20;
  if (/summar|arc|month|october|overall/.test(text)) {
    const all = [...c.past, c.today];
    return arcSummary(c.arcName, all, c.settings, c.habits, c.streaks.overall.longest, c.protectedDates.length).text;
  }
  if (/dinner|eat|meal|food|lunch|breakfast|snack/.test(text)) return mealIdea(c);
  if (/sleep|bed/.test(text)) {
    const s = sleepStats([...c.past, c.today], g.sleepMin);
    if (!s.nights) return "You haven't logged any sleep yet. Add last night's bedtime and wake-up time on the Today page.";
    return `Across ${s.nights} logged nights you averaged ${fmtDuration(s.avgMin)} (target ${fmtDuration(g.sleepMin)}), with ${fmtDuration(s.debtMin)} of total shortfall.${s.consistencyLabel ? ` Bedtime consistency: ${s.consistencyLabel.toLowerCase()}.` : ''}`;
  }
  return [
    'I can answer from your logs. Try:',
    '• How much water do I have left?',
    '• How many steps do I need?',
    '• Why did my streak break?',
    '• How did I perform this week?',
    '• What should I focus on tomorrow?',
    '• What should I eat for dinner?',
    '• Give me a simple 20-minute workout',
    '• Summarize my arc',
  ].join('\n');
}

function whyStreakBroke(c: AssistantContext): string {
  const prot = new Set(c.protectedDates);
  const broken = [...c.past].reverse().find((e) => !e.success && !prot.has(e.date));
  if (!broken) return `Your streak hasn't broken this arc — current streak ${c.streaks.overall.current} day(s). 🔥`;
  const missing = breakingKeys(broken, c.settings).filter((k) => !broken.complete[k]);
  const why = missing.length
    ? `these streak goals weren't reached: ${missing.map((k) => CATEGORY_META[k].label.toLowerCase()).join(', ')}`
    : `the day's score (${Math.round(broken.score)}%) was under your ${c.settings.minDayScore}% minimum`;
  return `The last break was on ${broken.date}: ${why}. That's just one day — your history and longest streak (${c.streaks.overall.longest}) are still yours. ${c.protectionsLeft > 0 ? `You have ${c.protectionsLeft} streak protection(s) left for a future slip.` : ''}`.trim();
}

function weekSummary(c: AssistantContext): string {
  const week = c.past.slice(-7);
  if (!week.length) return "There aren't any finished days yet — check back tomorrow for your first summary.";
  const s = periodStats(week);
  return [
    `Last ${week.length} days: ${s.completedDays} complete, average score ${Math.round(s.avgScore)}%.`,
    `Steps ~${fmtInt(s.avgSteps)}/day, water ~${fmtLiters(s.avgWaterMl)}/day${s.avgSleepMin ? `, sleep ~${fmtDuration(s.avgSleepMin)}` : ''}.`,
    `Exercise goal met ${s.exerciseDays}/${week.length} days, diet ${s.dietDays}/${week.length}.`,
  ].join(' ');
}

function focusTomorrow(c: AssistantContext): string {
  const week = c.past.slice(-7);
  const keys = (['water', 'steps', 'sleep', 'exercise', 'diet'] as const).filter((k) => c.settings.policies[k] !== 'none');
  if (!week.length) {
    const open = keys.filter((k) => !c.today.complete[k]);
    return open.length
      ? `Start with what's still open today: ${open.map((k) => CATEGORY_META[k].label.toLowerCase()).join(', ')}. Tomorrow, try knocking out one goal before noon.`
      : 'Today is complete — tomorrow, repeat what worked and front-load one goal in the morning.';
  }
  const ranked = keys.map((k) => ({ k, n: week.filter((e) => e.complete[k]).length })).sort((a, b) => a.n - b.n);
  const f = ranked[0];
  const tips: Record<string, string> = {
    water: 'Drink 500 ml right after waking and keep a bottle in sight.',
    steps: 'Schedule a 20-minute walk — after lunch works for many people.',
    sleep: 'Set a wind-down alarm 45 minutes before your target bedtime.',
    exercise: 'Put a 15–20 minute session on your calendar before the evening.',
    diet: 'Log breakfast right away and plan a protein source for each meal.',
  };
  return `Focus on ${CATEGORY_META[f.k].label.toLowerCase()} — completed ${f.n}/${week.length} of the last days. ${tips[f.k]}`;
}

function mealIdea(c: AssistantContext): string {
  const g = c.settings.goals;
  const t = c.today.totals;
  const eaten = c.todayMeals.flatMap((m) => m.items);
  const parts: string[] = [];
  if (eaten.length) parts.push(`So far today: ${eaten.slice(0, 6).join(', ')}${eaten.length > 6 ? '…' : ''}.`);
  const proteinLeft = g.proteinG ? Math.max(0, g.proteinG - t.protein) : null;
  const calLeft = g.calories ? g.calories - t.calories : null;
  if (proteinLeft != null) parts.push(`You have about ${Math.round(proteinLeft)} g protein left for today's target.`);
  if (calLeft != null) parts.push(calLeft > 0 ? `Roughly ${fmtInt(calLeft)} kcal remain in your target.` : `You're at or above today's calorie target, so a lighter plate makes sense.`);
  const heavyProtein = proteinLeft != null && proteinLeft > 25;
  parts.push(
    heavyProtein
      ? 'Idea: a protein-centred plate — e.g. paneer or tofu tikka, dal with a side of vegetables, grilled chicken or fish with salad, or eggs with sautéed greens.'
      : 'Idea: a balanced plate — half vegetables, a quarter protein (dal, paneer, eggs, chicken, tofu), a quarter whole grains (roti, brown rice, millet).',
  );
  parts.push('Check the label or your usual portions for exact numbers when you log it.');
  return parts.join(' ');
}

export const WORKOUT_20 = [
  'Simple 20-minute bodyweight session (go at your own pace; skip anything that hurts):',
  '• 3 min warm-up: march in place, arm circles, hip circles',
  '• 3 rounds of: 40s squats · 20s rest · 40s push-ups (knees or wall is fine) · 20s rest · 40s glute bridges · 20s rest · 40s plank · 20s rest',
  '• 2 min cool-down: easy walk + gentle stretches',
  'Log it as a 20-minute Home workout when you finish.',
].join('\n');

/** Compact, serialisable context for the cloud assistant — only what it needs. */
export function contextForCloud(c: AssistantContext) {
  const day = (e: DayEval) => ({
    date: e.date,
    score: Math.round(e.score),
    success: e.success,
    water_ml: e.totals.waterMl,
    steps: e.totals.steps,
    sleep_min: e.totals.sleepMin,
    exercise_min: e.totals.exerciseMin,
    calories: e.totals.calories,
    protein_g: Math.round(e.totals.protein),
    completed: Object.entries(e.complete).filter(([, v]) => v).map(([k]) => k),
  });
  return {
    arc: { name: c.arcName, day: c.dayIndex, of: c.arcDays },
    goals: c.settings.goals,
    streak_rules: { policies: c.settings.policies, min_day_score: c.settings.minDayScore },
    streaks: {
      overall: c.streaks.overall,
      water: c.streaks.categories.water.current,
      steps: c.streaks.categories.steps.current,
      exercise: c.streaks.categories.exercise.current,
      sleep: c.streaks.categories.sleep.current,
      diet: c.streaks.categories.diet.current,
    },
    protections_left: c.protectionsLeft,
    habits: c.habits.filter((h) => h.active).map((h) => ({ name: h.name, target: h.target, unit: h.unit, done_today: !!c.today.habitComplete[h.id] })),
    today: day(c.today),
    today_meals: c.todayMeals,
    open_items_now: c.nudges.filter((n) => n.level !== 'done').map((n) => `${n.title}: ${n.body}`),
    recent_days: c.past.slice(-14).map(day),
  };
}
