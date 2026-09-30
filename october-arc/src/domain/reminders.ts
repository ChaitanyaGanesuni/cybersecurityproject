// Reminder planning (pure). Decides *whether* and *what* to notify for a slot.
// Delivery (web Notification API, push, native) lives in src/integrations/notify.ts.

import type { DayEval, Habit, NotificationLog, Settings } from './types';
import { hm } from './dates';
import { fmtDuration, fmtInt, fmtLiters } from './format';
import type { DayClock, Nudge } from './nudges';
import { nextAction, sortNudges } from './nudges';

export type Slot = 'morning' | 'afternoon' | 'evening' | 'night';
export const SLOTS: Slot[] = ['morning', 'afternoon', 'evening', 'night'];

export interface PlannedNotification {
  type: string; // slot name or `habit:<id>` — one of each per day at most
  title: string;
  body: string;
}

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
}): PlannedNotification[] {
  const { settings: s, clock, today, nudges, habits, sentToday, streak } = args;
  const r = s.reminders;
  if (!r.enabled || inQuietHours(clock.nowMin, r)) return [];
  const already = new Set(sentToday.map((n) => n.type));
  let budget = r.maxPerDay - sentToday.filter((n) => n.status === 'sent').length;
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
  return out;
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
