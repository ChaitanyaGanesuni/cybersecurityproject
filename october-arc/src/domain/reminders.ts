// Reminder planning (pure). Decides *whether* and *what* to notify for a slot.
// Delivery (web Notification API, push, native) lives in src/integrations/notify.ts.

import type { DayEval, Habit, NotificationLog, Settings } from './types';
import { hm, minutesToHM } from './dates';
import { fmtDuration, fmtInt, fmtLiters, roundTo } from './format';
import type { DayClock, History, Nudge } from './nudges';
import { computeNudges, dayClock, nextAction, sortNudges } from './nudges';

export type Slot = 'morning' | 'afternoon' | 'evening' | 'night';
export const SLOTS: Slot[] = ['morning', 'afternoon', 'evening', 'night'];

export interface PlannedNotification {
  type: string; // slot name, `habit:<id>` (once a day each) or `water:<HH:MM>` (recurring)
  title: string;
  body: string;
  /** Notifications sharing a tag replace each other instead of stacking. */
  tag?: string;
  /** Buttons on the notification, e.g. { action: 'water-add:250', title: '+250 ml' }. */
  actions?: { action: string; title: string }[];
}

const isWater = (type: string) => type.startsWith('water:');

export function inQuietHours(nowMin: number, r: Settings['reminders']): boolean {
  const a = hm(r.quietStart), b = hm(r.quietEnd);
  return a <= b ? nowMin >= a && nowMin < b : nowMin >= a || nowMin < b;
}

/**
 * Decide the notifications due right now. Called every minute while the app is
 * open (and on resume). Guarantees: at most one per slot/habit per day, never in
 * quiet hours, never more than maxPerDay, nothing when there's nothing useful to say.
 */
export function dueNotifications(args: {
  settings: Settings;
  clock: DayClock;
  today: DayEval;
  nudges: Nudge[];
  habits: Habit[];
  sentToday: NotificationLog[];
  streak: number;
  now: Date;
  /** Time of today's most recent water entry (ms), if any. */
  lastDrinkAt: number | null;
}): PlannedNotification[] {
  const { settings: s, clock, today, nudges, habits, sentToday, streak } = args;
  const r = s.reminders;
  if (!r.enabled || inQuietHours(clock.nowMin, r)) return [];
  const already = new Set(sentToday.map((n) => n.type));
  // Recurring water reminders are paced by their own interval, not the daily cap.
  let budget = r.maxPerDay - sentToday.filter((n) => n.status === 'sent' && !isWater(n.type)).length;
  const out: PlannedNotification[] = [];

  for (const slot of SLOTS) {
    const at = r[slot];
    if (!at || budget <= 0 || already.has(slot)) continue;
    // Fire within a 90-minute window after the slot time; otherwise it's stale.
    const delta = clock.nowMin - hm(at);
    if (delta < 0 || delta > 90) continue;
    const n = composeSlot(slot, s, today, nudges, streak);
    if (n) {
      out.push(n);
      budget--;
    }
  }

  if (r.habitReminders) {
    for (const h of habits) {
      const type = `habit:${h.id}`;
      if (!h.reminderTime || budget <= 0 || already.has(type)) continue;
      if (!(h.id in today.habitComplete) || today.habitComplete[h.id]) continue;
      const delta = clock.nowMin - hm(h.reminderTime);
      if (delta < 0 || delta > 60) continue;
      out.push({ type, title: `${h.emoji} ${h.name}`, body: 'A gentle reminder — this one is still open for today.' });
      budget--;
    }
  }

  // Never buzz twice at once: water waits if anything else is going out now.
  if (!out.length) {
    const w = dueWaterReminder({ settings: s, clock, today, now: args.now, lastDrinkAt: args.lastDrinkAt, sentToday });
    if (w) out.push(w);
  }
  return out;
}

/**
 * Recurring hydration reminder. Fires when the water goal is still open, it's
 * within the waking day (and not in the last 30 minutes before bed), and at
 * least `waterEveryMin` has passed since the later of: wake-up time, the last
 * drink logged, and the last reminder of any kind. Logging water resets the timer.
 * The suggested amount keeps you on pace for the rest of the day.
 */
export function dueWaterReminder(args: {
  settings: Settings;
  clock: DayClock;
  today: DayEval;
  now: Date;
  lastDrinkAt: number | null;
  sentToday: NotificationLog[];
}): PlannedNotification | null {
  const { settings: s, clock, today: e, now } = args;
  const every = s.reminders.waterEveryMin;
  if (!every || s.policies.water === 'none' || e.complete.water) return null;
  if (clock.dayFraction <= 0 || clock.minutesLeft < 30) return null;

  const wake = new Date(now);
  const wm = hm(s.wakeTime);
  wake.setHours(Math.floor(wm / 60), wm % 60, 0, 0);
  // Any attempt counts (even a failed one), so a blocked channel isn't retried every minute.
  const lastSent = Math.max(0, ...args.sentToday.map((n) => n.scheduledAt));
  const anchor = Math.max(wake.getTime(), args.lastDrinkAt ?? 0, lastSent);
  if (now.getTime() - anchor < every * 60_000) return null;

  const goal = s.goals.waterMl;
  const ml = e.totals.waterMl;
  const remaining = goal - ml;
  const behind = Math.max(0, goal * clock.dayFraction - ml);
  const slotsLeft = Math.max(1, Math.floor(clock.minutesLeft / every));
  const suggest = Math.min(remaining, Math.min(750, Math.max(150, roundTo(Math.max(behind, remaining / slotsLeft), 50))));
  const catchUp = behind > 250;
  const finishes = suggest >= remaining;

  return {
    type: `water:${minutesToHM(clock.nowMin)}`,
    tag: 'water',
    title: catchUp ? '💧 Catch-up sip time' : '💧 Water break',
    body: `${fmtLiters(ml)} / ${fmtLiters(goal)}. Have about ${suggest} ml now${
      finishes ? ' — that finishes today’s goal! 🎉' : catchUp ? ' to get back on pace.' : ' to stay on pace.'
    }`,
    actions: [
      { action: 'water-add:250', title: '+250 ml' },
      { action: `water-add:${suggest === 250 ? 500 : suggest}`, title: `+${suggest === 250 ? 500 : suggest} ml` },
    ],
  };
}

export function composeSlot(
  slot: Slot,
  s: Settings,
  e: DayEval,
  nudges: Nudge[],
  streak: number,
): PlannedNotification | null {
  const g = s.goals;
  const open = sortNudges(nudges.filter((n) => n.level !== 'done'));
  switch (slot) {
    case 'morning':
      return {
        type: slot,
        title: '☀️ Good morning!',
        body: `Your arc continues${streak > 0 ? ` — ${streak}-day streak 🔥` : ''}. Today: 💧 ${fmtLiters(g.waterMl)} · 🚶 ${fmtInt(g.steps)} · 😴 ${fmtDuration(g.sleepMin)} · 🏃 ${g.exerciseMin}m`,
      };
    case 'afternoon': {
      if (e.complete.water) {
        const n = nextAction(nudges);
        return n ? { type: slot, title: `${n.emoji} ${n.title}`, body: n.body } : null;
      }
      return { type: slot, title: '💧 Hydration check', body: `You're at ${fmtLiters(e.totals.waterMl)} / ${fmtLiters(g.waterMl)}. Keep going!` };
    }
    case 'evening': {
      if (e.success) return null; // nothing to nag about
      const n = open[0];
      if (!n) return null;
      return {
        type: slot,
        title: streak > 0 ? '🔥 Your streak is still alive' : `${n.emoji} ${n.title}`,
        body: streak > 0 ? `${n.title}. ${n.body}` : n.body,
      };
    }
    case 'night': {
      const keys = e.scored.filter((k) => k !== 'habits');
      const done = keys.filter((k) => e.complete[k]).length;
      return {
        type: slot,
        title: e.success ? '🔥 Day complete!' : '🌙 Check-in time',
        body: e.success
          ? `You completed ${done}/${keys.length} goals today. Tap to reflect on your day.`
          : `You completed ${done}/${keys.length} goals today. Finish a remaining goal if it fits your evening, then check in.`,
      };
    }
  }
}

export interface Scheduled {
  at: Date;
  date: string; // local day the notification belongs to
  n: PlannedNotification;
}

/**
 * Plan every notification from `now` to the end of today, plus the next
 * mornings, for platforms that can schedule ahead (the Android app). It replays
 * the exact live rules — dueNotifications — minute by minute, assuming nothing
 * else is logged, so web and Android behave identically. Re-plan whenever data
 * changes: logging water pushes the next water reminder back, finishing the
 * day drops the evening nudge, and so on.
 */
export function planSchedule(args: {
  settings: Settings;
  now: Date;
  today: DayEval;
  habits: Habit[];
  history: History;
  streakAlive: boolean;
  streak: number;
  /** Today's notifications already delivered (or scheduled in the past). */
  sentToday: NotificationLog[];
  lastDrinkAt: number | null;
  daysAhead?: number;
}): Scheduled[] {
  const s = args.settings;
  if (!s.reminders.enabled) return [];
  const out: Scheduled[] = [];
  const sent = [...args.sentToday];
  const t = new Date(args.now);
  t.setSeconds(0, 0);
  t.setMinutes(t.getMinutes() + 1);
  const end = new Date(args.now);
  end.setHours(23, 59, 0, 0);
  for (; t <= end; t.setMinutes(t.getMinutes() + 1)) {
    const clock = dayClock(t, s);
    const nudges = computeNudges(args.today, s, args.habits, clock, args.history, args.streakAlive);
    const due = dueNotifications({ settings: s, clock, today: args.today, nudges, habits: args.habits, sentToday: sent, streak: args.streak, now: t, lastDrinkAt: args.lastDrinkAt });
    for (const n of due) {
      out.push({ at: new Date(t), date: args.today.date, n });
      sent.push({ id: `plan:${n.type}`, updatedAt: 0, date: args.today.date, type: n.type, scheduledAt: t.getTime(), sentAt: t.getTime(), status: 'sent', title: n.title, body: n.body });
    }
  }
  // Upcoming mornings: progress isn't known yet, so a simple targets reminder.
  const morning = s.reminders.morning;
  if (morning && !inQuietHours(hm(morning), s.reminders)) {
    for (let d = 1; d <= (args.daysAhead ?? 3); d++) {
      const at = new Date(args.now);
      at.setDate(at.getDate() + d);
      at.setHours(Math.floor(hm(morning) / 60), hm(morning) % 60, 0, 0);
      const date = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
      out.push({ at, date, n: composeSlot('morning', s, args.today, [], 0)! });
    }
  }
  return out;
}
