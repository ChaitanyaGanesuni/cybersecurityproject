// Core domain types for October Arc. Everything here is plain data so the
// same shapes can live in IndexedDB, travel through sync, and feed pure logic.

export type Category = 'water' | 'steps' | 'sleep' | 'exercise' | 'diet';
export type ScoreKey = Category | 'habits';
export const CATEGORIES: Category[] = ['water', 'steps', 'sleep', 'exercise', 'diet'];
export const SCORE_KEYS: ScoreKey[] = [...CATEGORIES, 'habits'];

/** How a category affects the overall streak. */
export type StreakPolicy = 'breaks' | 'score' | 'none';

export type FoodFlag =
  | 'vegetables'
  | 'fruits'
  | 'protein'
  | 'wholeGrains'
  | 'healthyFats'
  | 'junk'
  | 'addedSugar'
  | 'sugaryDrinks';

/** Flags where "yes" is the thing to avoid. */
export const AVOID_FLAGS: FoodFlag[] = ['junk', 'addedSugar', 'sugaryDrinks'];

export type PrimaryGoal =
  | 'fitness'
  | 'weight'
  | 'consistency'
  | 'sleep'
  | 'hydration'
  | 'eating'
  | 'wellness';

export interface Goals {
  waterMl: number;
  steps: number;
  sleepMin: number;
  exerciseMin: number;
  /** Daily calorie target, or null when the user doesn't track calories. */
  calories: number | null;
  /** How far above the calorie target still counts as "on target" (percent). */
  calorieTolerancePct: number;
  proteinG: number | null;
}

export interface ReminderPrefs {
  enabled: boolean;
  morning: string | null; // "HH:MM" or null to disable the slot
  afternoon: string | null;
  evening: string | null;
  night: string | null;
  habitReminders: boolean;
  /**
   * Recurring hydration reminders: minutes between reminders while the water
   * goal is open, or null for off. Missing on settings saved before this
   * option existed, which also means off.
   */
  waterEveryMin?: number | null;
  maxPerDay: number;
  quietStart: string; // "HH:MM"
  quietEnd: string;
}

export interface Settings {
  id: 'settings';
  updatedAt: number;
  onboarded: boolean;
  name: string;
  timezone: string;
  primaryGoal: PrimaryGoal;
  goals: Goals;
  weights: Record<ScoreKey, number>;
  policies: Record<ScoreKey, StreakPolicy>;
  /** Minimum daily score (0-100) for a day to count toward the overall streak. */
  minDayScore: number;
  protectionsPerArc: number;
  /** Food-quality flags the user cares about. Avoid-flags among them count toward diet. */
  trackedFoodFlags: FoodFlag[];
  /** Typical wake/bed times, used to pace reminders through the day. */
  wakeTime: string;
  bedTime: string;
  reminders: ReminderPrefs;
  assistant: { cloudEnabled: boolean };
  showBodyTracking: boolean;
}

/** Every synced record carries an id and a last-modified timestamp (ms). */
export interface Rec {
  id: string;
  updatedAt: number;
}

export interface Arc extends Rec {
  name: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // inclusive
  goals: Goals; // snapshot at arc start
  protectionsTotal: number;
  status: 'active' | 'completed';
  completedAt?: number;
}

export interface WaterEntry extends Rec {
  date: string;
  ml: number;
  at: number;
}

export interface StepsEntry extends Rec {
  // id === date: one total per day
  date: string;
  steps: number;
  source: string; // 'manual' or a health provider id
}

export interface SleepEntry extends Rec {
  // id === date (the morning you woke up)
  date: string;
  bedtime: string; // HH:MM
  wakeTime: string; // HH:MM
  minutes: number;
  quality?: 1 | 2 | 3 | 4 | 5; // self-rated, optional
}

export type MealType = 'breakfast' | 'lunch' | 'snacks' | 'dinner' | 'drinks';
export const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'snacks', 'dinner', 'drinks'];

export interface FoodItem {
  name: string;
  quantity: string;
  // Unknown nutrition stays undefined — never guessed.
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
}

export interface Meal extends Rec {
  date: string;
  mealType: MealType;
  items: FoodItem[];
  notes?: string;
  /** Local-only data URL. Never synced. */
  photo?: string;
  at: number;
}

export interface MealTemplate extends Rec {
  name: string;
  mealType: MealType;
  items: FoodItem[];
}

export interface FoodQuality extends Rec {
  // id === date
  date: string;
  flags: Partial<Record<FoodFlag, boolean>>;
}

export type WorkoutType =
  | 'walking'
  | 'running'
  | 'cycling'
  | 'gym'
  | 'yoga'
  | 'sports'
  | 'home'
  | 'other';

export interface Workout extends Rec {
  date: string;
  type: WorkoutType;
  durationMin: number;
  distanceKm?: number;
  caloriesBurned?: number;
  notes?: string;
  /** Start time, HH:MM — used for "you complete more often before 7 PM" insights. */
  startTime: string;
}

export interface Habit extends Rec {
  name: string;
  emoji: string;
  target: number; // 1 for yes/no habits
  unit: string; // '' for yes/no
  reminderTime: string | null;
  active: boolean;
  order: number;
  /** First day the habit counts; earlier days are not judged against it. */
  createdDate: string;
  /** Day the habit was archived (exclusive); history before it is kept. */
  archivedDate?: string;
}

export interface HabitCompletion extends Rec {
  // id === `${habitId}:${date}`
  habitId: string;
  date: string;
  value: number;
}

export interface WeightEntry extends Rec {
  date: string;
  weightKg?: number;
  waistCm?: number;
  chestCm?: number;
  hipCm?: number;
}

export type Mood = 'great' | 'good' | 'okay' | 'tired' | 'poor';

export interface CheckIn extends Rec {
  // id === date
  date: string;
  mood: Mood | null;
  note: string;
  score: number;
  reflection: string;
}

/**
 * Finalized end-of-day snapshot (the "DailyLog"): score, completed goals and
 * streak outcome as judged with the settings in force that day. Recomputed only
 * if that day's raw data is edited later.
 */
export interface DaySummary extends Rec {
  // id === date
  date: string;
  eval: DayEval;
}

export interface ProtectionUse extends Rec {
  // id === date that was protected
  date: string;
  arcId: string;
}

export interface NotificationLog extends Rec {
  date: string;
  type: string;
  scheduledAt: number;
  sentAt: number | null;
  /** 'scheduled' = handed to the OS to fire at scheduledAt (native app). */
  status: 'sent' | 'skipped' | 'failed' | 'scheduled';
  title: string;
  body: string;
}

/** Aggregated raw totals for one day. */
export interface DayTotals {
  waterMl: number;
  steps: number;
  sleepMin: number | null;
  exerciseMin: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  mealsLogged: number;
  /** Items missing calorie info — shown so totals are never over-trusted. */
  itemsMissingCalories: number;
  flags: Partial<Record<FoodFlag, boolean>>;
  habits: Record<string, number>;
  firstWorkoutTime: string | null;
  bedtime: string | null;
  wakeTime: string | null;
}

export interface DayEval {
  date: string;
  totals: DayTotals;
  progress: Record<ScoreKey, number>; // 0..1
  complete: Record<ScoreKey, boolean>;
  habitComplete: Record<string, boolean>;
  /** Score keys that count (policy != none and weight > 0 and applicable). */
  scored: ScoreKey[];
  score: number; // 0..100
  success: boolean;
  hasData: boolean;
}
