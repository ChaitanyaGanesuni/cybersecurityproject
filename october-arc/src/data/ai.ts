// Client for AI meal/exercise logging (server/food.ts). Requires a signed-in
// October Arc server with an AI key (Gemini or Claude). Standard foods come
// back with USDA lab values when the server has a USDA key; everything else is
// an AI estimate. The user reviews the result before saving.

import { api, getSession, serverInfo } from './api';
import { NUTRIENT_KEYS, type NutrientKey } from '../domain/nutrients';
import type { FoodItem, MealType, WorkoutType } from '../domain/types';

export interface FoodAnalysis {
  kind: 'meal' | 'exercise' | 'unclear';
  title: string;
  meal_type: MealType | null;
  items: {
    name: string;
    quantity: string;
    grams: number;
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    confidence: 'low' | 'medium' | 'high';
    nutrients: Record<NutrientKey, number | null>;
    source: 'usda' | 'estimate';
    usda_food: { fdc_id: number; description: string } | null;
  }[];
  exercise: { type: WorkoutType; duration_min: number; distance_km: number | null; calories_burned: number | null } | null;
  assumptions: string;
  provider: 'gemini' | 'claude';
}

export const aiLoggingAvailable = () => !!getSession();

export const PROVIDER_NAMES = { gemini: 'Google Gemini', claude: 'Anthropic Claude' } as const;

/** Which AI provider (and whether USDA data) the signed-in server uses. */
export async function aiServerInfo(): Promise<{ ai: 'gemini' | 'claude' | null; usda: boolean } | null> {
  const s = getSession();
  if (!s) return null;
  try {
    const h = await serverInfo(s.serverUrl);
    return { ai: h.ai ?? (h.assistant ? 'claude' : null), usda: !!h.usda };
  } catch {
    return null;
  }
}

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

/** Convert the analysis into diary items; only non-USDA items are flagged as estimates. */
export function toFoodItems(a: FoodAnalysis): FoodItem[] {
  return a.items.map((i) => {
    const nutrients: FoodItem['nutrients'] = {};
    for (const k of NUTRIENT_KEYS) {
      const v = i.nutrients[k];
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0) nutrients[k] = round1(v);
    }
    const grams = i.grams > 0 ? Math.round(i.grams) : 0;
    const usda = i.source === 'usda' && i.usda_food ? { fdcId: i.usda_food.fdc_id, description: i.usda_food.description } : undefined;
    return {
      name: i.name,
      quantity: grams && !/\bg\b|gram/i.test(i.quantity) ? `${i.quantity} (~${grams} g)` : i.quantity,
      calories: Math.round(i.calories),
      protein: round1(i.protein_g),
      carbs: round1(i.carbs_g),
      fat: round1(i.fat_g),
      nutrients,
      ...(usda ? { usda } : { estimated: true }),
    };
  });
}
