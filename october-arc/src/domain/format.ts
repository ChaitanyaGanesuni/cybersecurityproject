import { hm, parseISODate } from './dates';

export const fmtInt = (n: number) => Math.round(n).toLocaleString('en-US');

export function fmtLiters(ml: number): string {
  const l = ml / 1000;
  return `${l % 1 === 0 ? l.toFixed(1) : l.toFixed(2).replace(/0$/, '')} L`;
}

export function fmtDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function fmtTime12(t: string): string {
  const total = hm(t);
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function fmtDateShort(date: string): string {
  return parseISODate(date)
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    .toUpperCase();
}

export function fmtDateLong(date: string): string {
  return parseISODate(date).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

export const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Round to a friendly multiple (e.g. walking minutes to the nearest 5). */
export const roundTo = (n: number, step: number) => Math.max(step, Math.round(n / step) * step);
