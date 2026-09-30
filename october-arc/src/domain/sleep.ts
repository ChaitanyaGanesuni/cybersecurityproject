// Pure helpers for importing sleep from a health platform.

import { minutesToHM } from './dates';

export const localMidnight = (date: string, plusDays = 0) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d + plusDays);
};
const hmOf = (d: Date) => minutesToHM(d.getHours() * 60 + d.getMinutes());

/**
 * Pick last night's sleep from Health Connect sessions: the longest session
 * that ended on `date` between midnight and 2 PM. Returns null if none.
 */
export function pickNight(date: string, sessions: { start: string; end: string }[]) {
  const from = localMidnight(date).getTime();
  const to = from + 14 * 3600_000;
  const nights = sessions
    .map((s) => ({ start: new Date(s.start), end: new Date(s.end) }))
    .filter((s) => s.end.getTime() > from && s.end.getTime() <= to && s.end > s.start)
    .sort((a, b) => b.end.getTime() - b.start.getTime() - (a.end.getTime() - a.start.getTime()));
  const n = nights[0];
  return n ? { bedtime: hmOf(n.start), wakeTime: hmOf(n.end) } : null;
}

