// Detailed nutrients beyond calories/macros. Shared by the app and the server
// (the AI meal estimator returns exactly these keys).
//
// Daily values are the general adult reference amounts used on US nutrition
// labels (FDA). They are a common yardstick, not a personal requirement.

import type { FoodItem, Meal } from './types';

export type NutrientGroup = 'carbs' | 'lipids' | 'vitamins' | 'minerals' | 'other';

export interface NutrientDef {
  key: string;
  label: string;
  unit: 'g' | 'mg' | 'µg';
  group: NutrientGroup;
  /** Reference daily value, or null when there is no standard one (e.g. total sugars). */
  dv: number | null;
  /** True when lower is better (shown as "limit" rather than a target). */
  limit?: boolean;
}

export const NUTRIENTS = [
  { key: 'fiber_g', label: 'Fiber', unit: 'g', group: 'carbs', dv: 28 },
  { key: 'sugars_g', label: 'Sugars', unit: 'g', group: 'carbs', dv: null },
  { key: 'added_sugars_g', label: 'Added sugars', unit: 'g', group: 'carbs', dv: 50, limit: true },
  { key: 'saturated_fat_g', label: 'Saturated fat', unit: 'g', group: 'lipids', dv: 20, limit: true },
  { key: 'trans_fat_g', label: 'Trans fat', unit: 'g', group: 'lipids', dv: null, limit: true },
  { key: 'monounsaturated_fat_g', label: 'Monounsaturated fat', unit: 'g', group: 'lipids', dv: null },
  { key: 'polyunsaturated_fat_g', label: 'Polyunsaturated fat', unit: 'g', group: 'lipids', dv: null },
  { key: 'omega3_g', label: 'Omega-3', unit: 'g', group: 'lipids', dv: 1.6 },
  { key: 'cholesterol_mg', label: 'Cholesterol', unit: 'mg', group: 'lipids', dv: 300, limit: true },
  { key: 'vitamin_a_ug', label: 'Vitamin A', unit: 'µg', group: 'vitamins', dv: 900 },
  { key: 'vitamin_c_mg', label: 'Vitamin C', unit: 'mg', group: 'vitamins', dv: 90 },
  { key: 'vitamin_d_ug', label: 'Vitamin D', unit: 'µg', group: 'vitamins', dv: 20 },
  { key: 'vitamin_e_mg', label: 'Vitamin E', unit: 'mg', group: 'vitamins', dv: 15 },
  { key: 'vitamin_k_ug', label: 'Vitamin K', unit: 'µg', group: 'vitamins', dv: 120 },
  { key: 'thiamin_mg', label: 'B1 (Thiamine)', unit: 'mg', group: 'vitamins', dv: 1.2 },
  { key: 'riboflavin_mg', label: 'B2 (Riboflavin)', unit: 'mg', group: 'vitamins', dv: 1.3 },
  { key: 'niacin_mg', label: 'B3 (Niacin)', unit: 'mg', group: 'vitamins', dv: 16 },
  { key: 'vitamin_b6_mg', label: 'B6', unit: 'mg', group: 'vitamins', dv: 1.7 },
  { key: 'folate_ug', label: 'Folate', unit: 'µg', group: 'vitamins', dv: 400 },
  { key: 'vitamin_b12_ug', label: 'B12', unit: 'µg', group: 'vitamins', dv: 2.4 },
  { key: 'calcium_mg', label: 'Calcium', unit: 'mg', group: 'minerals', dv: 1300 },
  { key: 'iron_mg', label: 'Iron', unit: 'mg', group: 'minerals', dv: 18 },
  { key: 'magnesium_mg', label: 'Magnesium', unit: 'mg', group: 'minerals', dv: 420 },
  { key: 'phosphorus_mg', label: 'Phosphorus', unit: 'mg', group: 'minerals', dv: 1250 },
  { key: 'potassium_mg', label: 'Potassium', unit: 'mg', group: 'minerals', dv: 4700 },
  { key: 'sodium_mg', label: 'Sodium', unit: 'mg', group: 'minerals', dv: 2300, limit: true },
  { key: 'zinc_mg', label: 'Zinc', unit: 'mg', group: 'minerals', dv: 11 },
  { key: 'selenium_ug', label: 'Selenium', unit: 'µg', group: 'minerals', dv: 55 },
  { key: 'copper_mg', label: 'Copper', unit: 'mg', group: 'minerals', dv: 0.9 },
  { key: 'manganese_mg', label: 'Manganese', unit: 'mg', group: 'minerals', dv: 2.3 },
  { key: 'water_g', label: 'Water in food', unit: 'g', group: 'other', dv: null },
  { key: 'caffeine_mg', label: 'Caffeine', unit: 'mg', group: 'other', dv: null },
  { key: 'alcohol_g', label: 'Alcohol', unit: 'g', group: 'other', dv: null },
] as const satisfies readonly NutrientDef[];

export type NutrientKey = (typeof NUTRIENTS)[number]['key'];
export const NUTRIENT_KEYS = NUTRIENTS.map((n) => n.key) as NutrientKey[];

export const GROUP_LABELS: Record<NutrientGroup, string> = {
  carbs: 'Carbohydrates',
  lipids: 'Lipids',
  vitamins: 'Vitamins',
  minerals: 'Minerals',
  other: 'Other',
};

export interface NutrientTotals {
  values: Partial<Record<NutrientKey, number>>;
  /** Items with detailed nutrient data / all items — totals cover only the former. */
  itemsWithDetail: number;
  items: number;
  estimatedItems: number;
}

export function sumNutrients(meals: Meal[]): NutrientTotals {
  const values: Partial<Record<NutrientKey, number>> = {};
  let items = 0, withDetail = 0, estimated = 0;
  for (const m of meals) {
    for (const it of m.items as FoodItem[]) {
      items++;
      if (it.estimated) estimated++;
      if (!it.nutrients) continue;
      withDetail++;
      for (const k of NUTRIENT_KEYS) {
        const v = it.nutrients[k];
        if (typeof v === 'number' && Number.isFinite(v)) values[k] = (values[k] ?? 0) + v;
      }
    }
  }
  return { values, itemsWithDetail: withDetail, items, estimatedItems: estimated };
}

export function fmtNutrient(v: number, unit: string): string {
  const n = v >= 100 ? Math.round(v) : v >= 10 ? Math.round(v * 10) / 10 : Math.round(v * 100) / 100;
  return `${n} ${unit}`;
}
