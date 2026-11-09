// USDA FoodData Central lookups: replaces AI-estimated nutrients with official
// lab values for standard foods. Free key from api.data.gov (USDA_API_KEY);
// default limit 1,000 requests/hour, so results are cached in memory.
//
// Only the generic "Foundation" and "SR Legacy" datasets are searched (not
// branded products). Values there are per 100 g of food.

import { NUTRIENTS, type NutrientKey } from '../src/domain/nutrients';

const BASE = process.env.USDA_BASE_URL ?? 'https://api.nal.usda.gov/fdc/v1';

export const usdaEnabled = () => !!process.env.USDA_API_KEY;

export interface UsdaNutrient {
  nutrientId?: number;
  nutrientName?: string;
  nutrientNumber?: string;
  unitName?: string;
  value?: number;
}

export interface UsdaFood {
  fdcId: number;
  description: string;
  dataType?: string;
  foodNutrients?: UsdaNutrient[];
}

/** USDA nutrient numbers for each of our keys, first match wins. */
const NUMBERS: Record<NutrientKey, string[]> = {
  fiber_g: ['291'],
  sugars_g: ['269', '269.3'],
  added_sugars_g: ['539'],
  saturated_fat_g: ['606'],
  trans_fat_g: ['605'],
  monounsaturated_fat_g: ['645'],
  polyunsaturated_fat_g: ['646'],
  omega3_g: [], // summed below from ALA + EPA + DPA + DHA
  cholesterol_mg: ['601'],
  vitamin_a_ug: ['320'], // RAE
  vitamin_c_mg: ['401'],
  vitamin_d_ug: ['328'], // D2 + D3
  vitamin_e_mg: ['323'],
  vitamin_k_ug: ['430'],
  thiamin_mg: ['404'],
  riboflavin_mg: ['405'],
  niacin_mg: ['406'],
  vitamin_b6_mg: ['415'],
  folate_ug: ['435', '417'], // DFE, else total folate
  vitamin_b12_ug: ['418'],
  calcium_mg: ['301'],
  iron_mg: ['303'],
  magnesium_mg: ['304'],
  phosphorus_mg: ['305'],
  potassium_mg: ['306'],
  sodium_mg: ['307'],
  zinc_mg: ['309'],
  selenium_ug: ['317'],
  copper_mg: ['312'],
  manganese_mg: ['315'],
  water_g: ['255'],
  caffeine_mg: ['262'],
  alcohol_g: ['221'],
};
const OMEGA3 = ['851', '629', '631', '621']; // ALA, EPA, DPA, DHA
const ENERGY_KCAL = ['208', '957', '958']; // Energy; Atwater general; Atwater specific
const PROTEIN = ['203'];
const FAT = ['204'];
const CARBS = ['205'];

const SCALE: Record<string, number> = { g: 1, mg: 1e-3, ug: 1e-6, 'µg': 1e-6 };

/** Convert a USDA value to the unit our key expects; null if not convertible (e.g. IU). */
function convert(value: number, from: string | undefined, to: string): number | null {
  const f = (from ?? '').toLowerCase();
  const t = to.toLowerCase();
  if (f === t) return value;
  if (f in SCALE && t in SCALE) return (value * SCALE[f]) / SCALE[t];
  return null;
}

function find(food: UsdaFood, numbers: string[], unit: string): number | null {
  for (const num of numbers) {
    const n = food.foodNutrients?.find((x) => x.nutrientNumber === num && typeof x.value === 'number');
    if (n) {
      const v = convert(n.value!, n.unitName, unit);
      if (v != null) return v;
    }
  }
  return null;
}

export interface Per100g {
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  nutrients: Partial<Record<NutrientKey, number>>;
}

/** Pull the values we use out of a USDA food record, per 100 g. */
export function per100g(food: UsdaFood): Per100g {
  const nutrients: Partial<Record<NutrientKey, number>> = {};
  for (const d of NUTRIENTS) {
    const unit = d.unit === 'µg' ? 'ug' : d.unit;
    const v = find(food, NUMBERS[d.key], unit);
    if (v != null) nutrients[d.key] = v;
  }
  const o3 = OMEGA3.map((n) => find(food, [n], 'g')).filter((v): v is number => v != null);
  if (o3.length) nutrients.omega3_g = o3.reduce((a, b) => a + b, 0);
  return {
    calories: find(food, ENERGY_KCAL, 'kcal'),
    protein: find(food, PROTEIN, 'g'),
    carbs: find(food, CARBS, 'g'),
    fat: find(food, FAT, 'g'),
    nutrients,
  };
}

const singular = (w: string) => w.replace(/(ies)$/, 'y').replace(/(es|s)$/, '');

/**
 * A result counts as a match only if it is about the same main food: the
 * query's first word (e.g. "Egg" in "Egg, whole, cooked") must appear in the
 * USDA description. Avoids "bread" matching "breadfruit" style surprises.
 */
export function isMatch(query: string, description: string): boolean {
  const head = singular(query.split(/[,(]/)[0].trim().split(/\s+/)[0]?.toLowerCase() ?? '');
  if (head.length < 3) return false;
  const words = description.toLowerCase().split(/[^a-z]+/).map(singular);
  return words.includes(head);
}

const cache = new Map<string, UsdaFood | null>();

export async function searchFood(query: string, f: typeof fetch = fetch): Promise<UsdaFood | null> {
  const key = query.trim().toLowerCase();
  if (cache.has(key)) return cache.get(key)!;
  const url = `${BASE}/foods/search?api_key=${encodeURIComponent(process.env.USDA_API_KEY ?? '')}`;
  const res = await f(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, dataType: ['Foundation', 'SR Legacy'], pageSize: 5 }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`USDA search failed (${res.status})`);
  const data = (await res.json()) as { foods?: UsdaFood[] };
  const hit = (data.foods ?? []).find((food) => isMatch(query, food.description)) ?? null;
  if (cache.size > 500) cache.delete(cache.keys().next().value!);
  cache.set(key, hit);
  return hit;
}
