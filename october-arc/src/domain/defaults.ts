import type { FoodFlag, Goals, PrimaryGoal, Settings, WorkoutType, MealType } from './types';

export const DEFAULT_GOALS: Goals = {
  waterMl: 3000,
  steps: 8000,
  sleepMin: 450,
  exerciseMin: 30,
  calories: null,
  calorieTolerancePct: 10,
  proteinG: null,
};

export function defaultSettings(): Settings {
  return {
    id: 'settings',
    updatedAt: 0,
    onboarded: false,
    name: '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    primaryGoal: 'consistency',
    goals: { ...DEFAULT_GOALS },
    weights: { water: 20, steps: 20, sleep: 20, exercise: 20, diet: 20, habits: 0 },
    policies: {
      water: 'breaks',
      steps: 'breaks',
      sleep: 'score',
      exercise: 'breaks',
      diet: 'score',
      habits: 'score',
    },
    minDayScore: 70,
    protectionsPerArc: 2,
    trackedFoodFlags: ['vegetables', 'fruits', 'protein', 'junk', 'sugaryDrinks'],
    wakeTime: '07:00',
    bedTime: '23:00',
    reminders: {
      enabled: false,
      morning: '08:00',
      afternoon: '14:30',
      evening: '19:30',
      night: '21:30',
      habitReminders: true,
      maxPerDay: 4,
      quietStart: '22:30',
      quietEnd: '07:00',
    },
    assistant: { cloudEnabled: false },
    showBodyTracking: true,
  };
}

export const PRIMARY_GOALS: { id: PrimaryGoal; label: string; emoji: string }[] = [
  { id: 'fitness', label: 'Improve fitness', emoji: '🏃' },
  { id: 'weight', label: 'Lose weight', emoji: '⚖️' },
  { id: 'consistency', label: 'Build consistency', emoji: '🔥' },
  { id: 'sleep', label: 'Improve sleep', emoji: '😴' },
  { id: 'hydration', label: 'Improve hydration', emoji: '💧' },
  { id: 'eating', label: 'Build healthier eating habits', emoji: '🥗' },
  { id: 'wellness', label: 'General wellness', emoji: '🧘' },
];

export const FOOD_FLAGS: { id: FoodFlag; label: string; emoji: string; avoid: boolean }[] = [
  { id: 'vegetables', label: 'Vegetables', emoji: '🥗', avoid: false },
  { id: 'fruits', label: 'Fruits', emoji: '🍎', avoid: false },
  { id: 'protein', label: 'Protein', emoji: '🥚', avoid: false },
  { id: 'wholeGrains', label: 'Whole grains', emoji: '🌾', avoid: false },
  { id: 'healthyFats', label: 'Healthy fats', emoji: '🥜', avoid: false },
  { id: 'junk', label: 'Junk food', emoji: '🍟', avoid: true },
  { id: 'addedSugar', label: 'Added sugar', emoji: '🍬', avoid: true },
  { id: 'sugaryDrinks', label: 'Sugary drinks', emoji: '🥤', avoid: true },
];

export const WORKOUT_TYPES: { id: WorkoutType; label: string; emoji: string }[] = [
  { id: 'walking', label: 'Walking', emoji: '🚶' },
  { id: 'running', label: 'Running', emoji: '🏃' },
  { id: 'cycling', label: 'Cycling', emoji: '🚴' },
  { id: 'gym', label: 'Gym', emoji: '🏋️' },
  { id: 'yoga', label: 'Yoga', emoji: '🧘' },
  { id: 'sports', label: 'Sports', emoji: '⚽' },
  { id: 'home', label: 'Home workout', emoji: '🏠' },
  { id: 'other', label: 'Other', emoji: '✨' },
];

export const MEAL_LABELS: Record<MealType, { label: string; emoji: string }> = {
  breakfast: { label: 'Breakfast', emoji: '🍳' },
  lunch: { label: 'Lunch', emoji: '🍛' },
  snacks: { label: 'Snacks', emoji: '🍎' },
  dinner: { label: 'Dinner', emoji: '🍲' },
  drinks: { label: 'Drinks', emoji: '☕' },
};

export const CATEGORY_META = {
  water: { label: 'Water', emoji: '💧', route: '#/today/water' },
  steps: { label: 'Steps', emoji: '🚶', route: '#/today/steps' },
  sleep: { label: 'Sleep', emoji: '😴', route: '#/today/sleep' },
  exercise: { label: 'Exercise', emoji: '🏃', route: '#/today/exercise' },
  diet: { label: 'Diet', emoji: '🍽️', route: '#/food' },
  habits: { label: 'Habits', emoji: '✅', route: '#/today/habits' },
} as const;

export const HABIT_SUGGESTIONS: { name: string; emoji: string; target: number; unit: string }[] = [
  { name: 'Wake up before 7 AM', emoji: '⏰', target: 1, unit: '' },
  { name: 'No junk food', emoji: '🚫', target: 1, unit: '' },
  { name: 'No sugary drinks', emoji: '🥤', target: 1, unit: '' },
  { name: 'Meditation', emoji: '🧘', target: 10, unit: 'min' },
  { name: 'Read', emoji: '📖', target: 10, unit: 'pages' },
  { name: 'Stretching', emoji: '🤸', target: 1, unit: '' },
  { name: 'Skincare', emoji: '🧴', target: 1, unit: '' },
  { name: 'Take supplements', emoji: '💊', target: 1, unit: '' },
];

/** Gentle default emphasis per primary goal. Users can change everything later. */
export function weightsForGoal(goal: PrimaryGoal): Settings['weights'] {
  const base = { water: 20, steps: 20, sleep: 20, exercise: 20, diet: 20, habits: 0 };
  switch (goal) {
    case 'fitness':
      return { ...base, steps: 25, exercise: 30, diet: 15, sleep: 15, water: 15 };
    case 'weight':
      return { ...base, steps: 25, diet: 25, exercise: 20, water: 15, sleep: 15 };
    case 'sleep':
      return { ...base, sleep: 35, water: 15, steps: 15, exercise: 15, diet: 20 };
    case 'hydration':
      return { ...base, water: 35, steps: 15, sleep: 15, exercise: 15, diet: 20 };
    case 'eating':
      return { ...base, diet: 35, water: 20, steps: 15, exercise: 15, sleep: 15 };
    default:
      return base;
  }
}
