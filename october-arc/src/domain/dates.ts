// Date helpers. Days are local-calendar "YYYY-MM-DD" strings in the user's
// device timezone, so a day always means the user's own day.

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(date: string, n: number): string {
  const d = parseISODate(date);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

export function daysBetween(a: string, b: string): number {
  // Use UTC to avoid DST off-by-one.
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

export function dateRange(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

export function monthBounds(date: string): { start: string; end: string } {
  const d = parseISODate(date);
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { start: toISODate(start), end: toISODate(end) };
}

/** "HH:MM" -> minutes after midnight. */
export function hm(s: string): number {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + (m || 0);
}

export function minutesToHM(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Sleep duration from bedtime to wake time, crossing midnight if needed. */
export function sleepMinutes(bedtime: string, wakeTime: string): number {
  let diff = hm(wakeTime) - hm(bedtime);
  if (diff <= 0) diff += 1440;
  return diff;
}

export function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

export function weekdayMon0(date: string): number {
  return (parseISODate(date).getDay() + 6) % 7;
}

export function monthName(date: string): string {
  return parseISODate(date).toLocaleString('en-US', { month: 'long' });
}
