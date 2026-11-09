// Client for AI meal/exercise logging (server/food.ts). Requires a signed-in
// October Arc server with ANTHROPIC_API_KEY. Results are estimates the user
// reviews before saving.

import { api, getSession } from './api';
import { NUTRIENT_KEYS, type NutrientKey } from '../domain/nutrients';
import type { FoodItem, MealType, WorkoutType } from '../domain/types';

export interface FoodAnalysis {
  kind: 'meal' | 'exercise' | 'unclear';
  title: string;
  meal_type: MealType | null;
  items: {
    name: string;
    quantity: string;
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    confidence: 'low' | 'medium' | 'high';
    nutrients: Record<NutrientKey, number | null>;
  }[];
  exercise: { type: WorkoutType; duration_min: number; distance_km: number | null; calories_burned: number | null } | null;
  assumptions: string;
}

export const aiLoggingAvailable = () => !!getSession();

export async function analyzeEntry(args: { text: string; photoDataUrl?: string; weightKg?: number }): Promise<FoodAnalysis> {
  const now = new Date();
  let image: { media: string; data: string } | undefined;
  if (args.photoDataUrl) {
    const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(args.photoDataUrl);
    if (!m) throw new Error('Unsupported photo format');
    image = { media: m[1], data: m[2] };
  }
  return api<FoodAnalysis>('/api/food/analyze', {
    text: args.text,
    image,
    localTime: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
    weightKg: args.weightKg,
  });
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Convert the AI's items into diary items, flagged as estimates. */
export function toFoodItems(a: FoodAnalysis): FoodItem[] {
  return a.items.map((i) => {
    const nutrients: FoodItem['nutrients'] = {};
    for (const k of NUTRIENT_KEYS) {
      const v = i.nutrients[k];
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0) nutrients[k] = round1(v);
    }
    return {
      name: i.name,
      quantity: i.quantity,
      calories: Math.round(i.calories),
      protein: round1(i.protein_g),
      carbs: round1(i.carbs_g),
      fat: round1(i.fat_g),
      nutrients,
      estimated: true,
    };
  });
}
