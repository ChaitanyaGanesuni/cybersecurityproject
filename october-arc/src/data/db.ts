// Local-first storage. IndexedDB (via Dexie) is the source of truth on the
// device; the app works fully offline and sync is an optional add-on.

import Dexie, { type Table } from 'dexie';
import type {
  Arc,
  CheckIn,
  DaySummary,
  FoodQuality,
  Habit,
  HabitCompletion,
  Meal,
  MealTemplate,
  NotificationLog,
  ProtectionUse,
  Settings,
  SleepEntry,
  StepsEntry,
  WaterEntry,
  WeightEntry,
  Workout,
} from '../domain/types';

export interface OutboxItem {
  key: string; // `${table}:${id}`
  table: SyncedTable;
  id: string;
  at: number;
}

export interface Meta {
  key: string;
  value: unknown;
}

export class ArcDB extends Dexie {
  settings!: Table<Settings, string>;
  arcs!: Table<Arc, string>;
  water!: Table<WaterEntry, string>;
  steps!: Table<StepsEntry, string>;
  sleep!: Table<SleepEntry, string>;
  meals!: Table<Meal, string>;
  mealTemplates!: Table<MealTemplate, string>;
  quality!: Table<FoodQuality, string>;
  workouts!: Table<Workout, string>;
  habits!: Table<Habit, string>;
  habitCompletions!: Table<HabitCompletion, string>;
  weights!: Table<WeightEntry, string>;
  checkins!: Table<CheckIn, string>;
  summaries!: Table<DaySummary, string>;
  protections!: Table<ProtectionUse, string>;
  notifications!: Table<NotificationLog, string>;
  outbox!: Table<OutboxItem, string>;
  meta!: Table<Meta, string>;

  constructor(name = 'october-arc') {
    super(name);
    this.version(1).stores({
      settings: 'id',
      arcs: 'id, startDate',
      water: 'id, date',
      steps: 'id, date',
      sleep: 'id, date',
      meals: 'id, date',
      mealTemplates: 'id',
      quality: 'id, date',
      workouts: 'id, date',
      habits: 'id, order',
      habitCompletions: 'id, date, habitId',
      weights: 'id, date',
      checkins: 'id, date',
      summaries: 'id, date',
      protections: 'id, arcId',
      notifications: 'id, date',
      outbox: 'key',
      meta: 'key',
    });
  }
}

/** Tables that are user data and take part in sync. Summaries and the
 *  notification log are derived/device-local and never leave the device. */
export const SYNCED_TABLES = [
  'settings',
  'arcs',
  'water',
  'steps',
  'sleep',
  'meals',
  'mealTemplates',
  'quality',
  'workouts',
  'habits',
  'habitCompletions',
  'weights',
  'checkins',
  'protections',
] as const;
export type SyncedTable = (typeof SYNCED_TABLES)[number];

export const db = new ArcDB();
