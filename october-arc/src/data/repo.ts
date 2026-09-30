// All writes go through here so every change is timestamped and queued in the
// outbox for sync. Nothing is ever lost offline: the write lands in IndexedDB
// first and the outbox is drained whenever a connection is available.

import { db, SYNCED_TABLES, type SyncedTable } from './db';
import type {
  Arc,
  CheckIn,
  FoodFlag,
  Habit,
  Meal,
  MealTemplate,
  Mood,
  Rec,
  Settings,
  Workout,
  WeightEntry,
} from '../domain/types';
import { defaultSettings } from '../domain/defaults';
import { addDays, monthBounds, monthName, sleepMinutes } from '../domain/dates';

export const uid = () =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);

type Listener = () => void;
const listeners = new Set<Listener>();
/** Sync engine subscribes to be poked after local writes. */
export const onLocalWrite = (l: Listener) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

async function put<T extends Rec>(table: SyncedTable, rec: T): Promise<T> {
  const r = { ...rec, updatedAt: Date.now() };
  await db.transaction('rw', [db.table(table), db.outbox], async () => {
    await db.table(table).put(r);
    await db.outbox.put({ key: `${table}:${r.id}`, table, id: r.id, at: r.updatedAt });
  });
  listeners.forEach((l) => l());
  return r;
}

async function remove(table: SyncedTable, id: string): Promise<void> {
  await db.transaction('rw', [db.table(table), db.outbox], async () => {
    await db.table(table).delete(id);
    await db.outbox.put({ key: `${table}:${id}`, table, id, at: Date.now() });
  });
  listeners.forEach((l) => l());
}

// ---------- settings & arcs ----------

export async function getSettings(): Promise<Settings> {
  return (await db.settings.get('settings')) ?? defaultSettings();
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const cur = await getSettings();
  return put('settings', { ...cur, ...patch, id: 'settings' } as Settings);
}

export function arcDatesFor(kind: 'nextMonth' | 'today30' | 'thisMonth', today: string) {
  if (kind === 'nextMonth') {
    const { end } = monthBounds(today);
    const start = addDays(end, 1);
    return { start, end: monthBounds(start).end };
  }
  if (kind === 'thisMonth') return { start: today, end: monthBounds(today).end };
  return { start: today, end: addDays(today, 29) };
}

export async function startArc(start: string, end: string, settings: Settings, name?: string): Promise<Arc> {
  const existing = await db.arcs.filter((a) => a.status === 'active').toArray();
  for (const a of existing) await put('arcs', { ...a, status: 'completed', completedAt: Date.now() });
  return put('arcs', {
    id: uid(),
    updatedAt: 0,
    name: name ?? `${monthName(start)} Arc`,
    startDate: start,
    endDate: end,
    goals: { ...settings.goals },
    protectionsTotal: settings.protectionsPerArc,
    status: 'active',
  });
}

export async function completeArc(arc: Arc) {
  return put('arcs', { ...arc, status: 'completed', completedAt: Date.now() });
}

// ---------- daily tracking ----------

export async function addWater(date: string, ml: number) {
  return put('water', { id: uid(), updatedAt: 0, date, ml, at: Date.now() });
}

export async function undoLastWater(date: string) {
  const items = await db.water.where('date').equals(date).sortBy('at');
  const last = items[items.length - 1];
  if (last) await remove('water', last.id);
}

export async function setSteps(date: string, steps: number, source = 'manual') {
  return put('steps', { id: date, updatedAt: 0, date, steps: Math.max(0, Math.round(steps)), source });
}

export async function setSleep(date: string, bedtime: string, wakeTime: string, quality?: 1 | 2 | 3 | 4 | 5) {
  return put('sleep', { id: date, updatedAt: 0, date, bedtime, wakeTime, minutes: sleepMinutes(bedtime, wakeTime), quality });
}

export async function clearSleep(date: string) {
  return remove('sleep', date);
}

export async function saveMeal(meal: Omit<Meal, 'updatedAt' | 'id' | 'at'> & { id?: string; at?: number }) {
  return put('meals', { ...meal, id: meal.id ?? uid(), at: meal.at ?? Date.now(), updatedAt: 0 });
}

export const deleteMeal = (id: string) => remove('meals', id);

export async function saveTemplate(t: Omit<MealTemplate, 'updatedAt' | 'id'> & { id?: string }) {
  return put('mealTemplates', { ...t, id: t.id ?? uid(), updatedAt: 0 });
}
export const deleteTemplate = (id: string) => remove('mealTemplates', id);

export async function setFoodFlag(date: string, flag: FoodFlag, value: boolean) {
  const cur = await db.quality.get(date);
  return put('quality', { id: date, updatedAt: 0, date, flags: { ...(cur?.flags ?? {}), [flag]: value } });
}

export async function saveWorkout(w: Omit<Workout, 'updatedAt' | 'id'> & { id?: string }) {
  return put('workouts', { ...w, id: w.id ?? uid(), updatedAt: 0 });
}
export const deleteWorkout = (id: string) => remove('workouts', id);

// ---------- habits ----------

export async function saveHabit(h: Omit<Habit, 'updatedAt' | 'id' | 'order' | 'createdDate'> & Partial<Habit>, today: string) {
  const count = await db.habits.count();
  return put('habits', {
    order: count,
    createdDate: today,
    ...h,
    id: h.id ?? uid(),
    updatedAt: 0,
  } as Habit);
}

/** Archiving keeps history: the habit stops counting from `today` onward. */
export async function archiveHabit(h: Habit, today: string) {
  return put('habits', { ...h, active: false, archivedDate: today });
}

export async function restoreHabit(h: Habit) {
  const { archivedDate: _drop, ...rest } = h;
  void _drop;
  return put('habits', { ...rest, active: true } as Habit);
}

/** Permanently delete a habit and its completions (user-controlled deletion). */
export async function deleteHabit(h: Habit) {
  const comps = await db.habitCompletions.where('habitId').equals(h.id).toArray();
  for (const c of comps) await remove('habitCompletions', c.id);
  await remove('habits', h.id);
}

export async function setHabitValue(habitId: string, date: string, value: number) {
  return put('habitCompletions', { id: `${habitId}:${date}`, updatedAt: 0, habitId, date, value: Math.max(0, value) });
}

// ---------- body, check-ins, protection ----------

export async function saveWeight(w: Omit<WeightEntry, 'updatedAt' | 'id'> & { id?: string }) {
  return put('weights', { ...w, id: w.id ?? uid(), updatedAt: 0 });
}
export const deleteWeight = (id: string) => remove('weights', id);

export async function saveCheckIn(date: string, mood: Mood | null, note: string, score: number, reflection: string) {
  return put<CheckIn>('checkins', { id: date, updatedAt: 0, date, mood, note, score, reflection });
}

export async function applyProtection(date: string, arc: Arc) {
  const used = await db.protections.where('arcId').equals(arc.id).count();
  if (used >= arc.protectionsTotal) throw new Error('No streak protections left for this arc.');
  return put('protections', { id: date, updatedAt: 0, date, arcId: arc.id });
}

export const undoProtection = (date: string) => remove('protections', date);

// ---------- privacy ----------

export async function exportAll(): Promise<Record<string, unknown[]>> {
  const out: Record<string, unknown[]> = {};
  for (const t of SYNCED_TABLES) out[t] = await db.table(t).toArray();
  out.checkinsAndSummaries = await db.summaries.toArray();
  return out;
}

/** Wipes every table on this device. */
export async function deleteAllLocalData() {
  await db.delete();
  localStorage.removeItem('oa.session');
  location.reload();
}
