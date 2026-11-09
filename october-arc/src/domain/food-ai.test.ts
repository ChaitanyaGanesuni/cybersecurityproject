import { afterEach, describe, expect, it } from 'vitest';
import { FoodAnalysisSchema, geminiSchema, groundWithUsda, parseModelJson, validateFoodRequest, type FoodAnalysis } from '../../server/food';
import { isMatch, per100g, type UsdaFood } from '../../server/usda';
import { aiProvider } from '../../server/ai-provider';
import { toFoodItems, type FoodAnalysis as ClientAnalysis } from '../data/ai';
import { NUTRIENT_KEYS, sumNutrients } from './nutrients';
import type { Meal } from './types';

const nutrients = (over: Record<string, number | null> = {}) =>
  Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, over[k] ?? null])) as FoodAnalysis['items'][number]['nutrients'];

const aiResult: FoodAnalysis = {
  kind: 'meal',
  title: 'Boiled Eggs, Bread and Gujiya',
  meal_type: 'breakfast',
  items: [
    { name: 'Boiled eggs', quantity: '3 large', grams: 150, usda_query: 'Egg, whole, cooked, hard-boiled', calories: 230, protein_g: 18, carbs_g: 2, fat_g: 15, confidence: 'high', nutrients: nutrients({ caffeine_mg: 0, vitamin_b12_ug: 1.5 }) },
    { name: 'Gujiya', quantity: '1 piece', grams: 45, usda_query: null, calories: 200, protein_g: 3, carbs_g: 28, fat_g: 9, confidence: 'medium', nutrients: nutrients({ sugars_g: 12 }) },
  ],
  exercise: null,
  assumptions: 'Assumed large eggs.',
};

/** Shaped like a USDA FoodData Central search result (SR Legacy, values per 100 g). */
const usdaEgg: UsdaFood = {
  fdcId: 173424,
  description: 'Egg, whole, cooked, hard-boiled',
  dataType: 'SR Legacy',
  foodNutrients: [
    { nutrientNumber: '208', nutrientName: 'Energy', unitName: 'KCAL', value: 155 },
    { nutrientNumber: '268', nutrientName: 'Energy', unitName: 'kJ', value: 649 },
    { nutrientNumber: '203', nutrientName: 'Protein', unitName: 'G', value: 12.58 },
    { nutrientNumber: '204', nutrientName: 'Total lipid (fat)', unitName: 'G', value: 10.61 },
    { nutrientNumber: '205', nutrientName: 'Carbohydrate, by difference', unitName: 'G', value: 1.12 },
    { nutrientNumber: '255', nutrientName: 'Water', unitName: 'G', value: 74.62 },
    { nutrientNumber: '601', nutrientName: 'Cholesterol', unitName: 'MG', value: 373 },
    { nutrientNumber: '307', nutrientName: 'Sodium, Na', unitName: 'MG', value: 124 },
    { nutrientNumber: '317', nutrientName: 'Selenium, Se', unitName: 'UG', value: 30.8 },
    { nutrientNumber: '418', nutrientName: 'Vitamin B-12', unitName: 'UG', value: 1.11 },
    { nutrientNumber: '328', nutrientName: 'Vitamin D (D2 + D3)', unitName: 'UG', value: 2.2 },
    { nutrientNumber: '324', nutrientName: 'Vitamin D (D2 + D3), International Units', unitName: 'IU', value: 87 },
    { nutrientNumber: '606', nutrientName: 'Fatty acids, total saturated', unitName: 'G', value: 3.267 },
    { nutrientNumber: '851', nutrientName: 'PUFA 18:3 n-3 c,c,c (ALA)', unitName: 'G', value: 0.035 },
    { nutrientNumber: '621', nutrientName: 'PUFA 22:6 n-3 (DHA)', unitName: 'G', value: 0.039 },
    { nutrientNumber: '303', nutrientName: 'Iron, Fe', unitName: 'MG', value: 1.19 },
  ],
};

const env = { ...process.env };
afterEach(() => {
  process.env = { ...env };
});

describe('USDA FoodData Central', () => {
  it('maps nutrient numbers to our keys per 100 g, converting units and skipping IU', () => {
    const v = per100g(usdaEgg);
    expect(v).toMatchObject({ calories: 155, protein: 12.58, fat: 10.61, carbs: 1.12 });
    expect(v.nutrients).toMatchObject({ cholesterol_mg: 373, sodium_mg: 124, selenium_ug: 30.8, vitamin_d_ug: 2.2, water_g: 74.62, iron_mg: 1.19 });
    expect(v.nutrients.omega3_g).toBeCloseTo(0.074);
    expect(v.nutrients.vitamin_c_mg).toBeUndefined();
  });

  it('uses Atwater energy when a Foundation food has no 208 value, and converts mg to g', () => {
    const v = per100g({ fdcId: 1, description: 'Bread', foodNutrients: [{ nutrientNumber: '957', unitName: 'KCAL', value: 266 }, { nutrientNumber: '291', unitName: 'MG', value: 2700 }] });
    expect(v.calories).toBe(266);
    expect(v.nutrients.fiber_g).toBeCloseTo(2.7);
  });

  it('only accepts a search result about the same main food', () => {
    expect(isMatch('Egg, whole, cooked, hard-boiled', 'Egg, whole, cooked, hard-boiled')).toBe(true);
    expect(isMatch('Eggs, scrambled', 'Egg, whole, cooked, scrambled')).toBe(true);
    expect(isMatch('Bread, white, commercially prepared', 'Breadfruit, raw')).toBe(false);
    expect(isMatch('Banana, raw', 'Bananas, raw')).toBe(true);
  });
});

describe('AI food logging pipeline', () => {
  it('replaces estimates with USDA values scaled to the grams; keeps estimates where USDA has nothing', async () => {
    process.env.USDA_API_KEY = 'test';
    const queries: string[] = [];
    const g = await groundWithUsda(aiResult, async (q) => (queries.push(q), usdaEgg));
    expect(queries).toEqual(['Egg, whole, cooked, hard-boiled']); // gujiya has no USDA query
    const [egg, gujiya] = g.items;
    expect(egg).toMatchObject({ source: 'usda', calories: 233, protein_g: 18.9, fat_g: 15.9, carbs_g: 1.7, usda_food: { fdc_id: 173424 } });
    expect(egg.nutrients.cholesterol_mg).toBe(559.5);
    expect(egg.nutrients.vitamin_b12_ug).toBe(1.67);
    // A USDA item never carries over AI guesses for nutrients USDA doesn't list.
    expect(egg.nutrients.caffeine_mg).toBeNull();
    expect(gujiya).toMatchObject({ source: 'estimate', calories: 200, usda_food: null });
  });

  it('falls back to the AI estimate when USDA fails, finds nothing, or is not configured', async () => {
    process.env.USDA_API_KEY = 'test';
    const failed = await groundWithUsda(aiResult, async () => { throw new Error('429'); });
    expect(failed.items[0]).toMatchObject({ source: 'estimate', calories: 230 });
    const none = await groundWithUsda(aiResult, async () => null);
    expect(none.items[0].source).toBe('estimate');
    delete process.env.USDA_API_KEY;
    let called = false;
    await groundWithUsda(aiResult, async () => ((called = true), usdaEgg));
    expect(called).toBe(false);
  });

  it('turns the result into diary items: USDA items cite their source, others are flagged estimates', async () => {
    process.env.USDA_API_KEY = 'test';
    const g = await groundWithUsda(aiResult, async () => usdaEgg);
    const items = toFoodItems({ ...g, provider: 'gemini' } as ClientAnalysis);
    expect(items[0]).toMatchObject({ name: 'Boiled eggs', quantity: '3 large (~150 g)', calories: 233, usda: { fdcId: 173424, description: 'Egg, whole, cooked, hard-boiled' } });
    expect(items[0].estimated).toBeUndefined();
    expect(items[1]).toMatchObject({ name: 'Gujiya', estimated: true });
    expect(items[1].usda).toBeUndefined();
    const meal: Meal = { id: 'm', updatedAt: 0, date: '2026-11-09', mealType: 'breakfast', at: 0, items };
    expect(sumNutrients([meal])).toMatchObject({ items: 2, usdaItems: 1, estimatedItems: 1 });
  });

  it('gives Gemini a JSON schema it supports and validates whatever comes back', () => {
    const s = geminiSchema();
    expect(s.$schema).toBeUndefined();
    const json = JSON.stringify(s);
    expect(json).toContain('"usda_query"');
    expect(json).toContain('"anyOf"'); // nullable numbers
    expect(FoodAnalysisSchema.safeParse(aiResult).success).toBe(true);
    expect(parseModelJson(JSON.stringify(aiResult)).title).toBe(aiResult.title);
    expect(() => parseModelJson('not json')).toThrow(/malformed/);
    expect(() => parseModelJson(JSON.stringify({ ...aiResult, items: [{ name: 'x' }] }))).toThrow(/incomplete/);
    expect(() => parseModelJson(undefined)).toThrow(/empty/);
  });

  it('picks the provider from the keys present, Gemini first', () => {
    delete process.env.GEMINI_API_KEY; delete process.env.ANTHROPIC_API_KEY; delete process.env.OA_AI_PROVIDER;
    expect(aiProvider()).toBeNull();
    process.env.ANTHROPIC_API_KEY = 'a';
    expect(aiProvider()).toBe('claude');
    process.env.GEMINI_API_KEY = 'g';
    expect(aiProvider()).toBe('gemini');
    process.env.OA_AI_PROVIDER = 'claude';
    expect(aiProvider()).toBe('claude');
    delete process.env.ANTHROPIC_API_KEY;
    expect(aiProvider()).toBeNull(); // forced provider without its key: off, not a silent switch
  });

  it('validates requests before anything is sent to a model', () => {
    expect(() => validateFoodRequest({})).toThrow(/Describe what you ate/);
    expect(() => validateFoodRequest({ text: 'x'.repeat(1001) })).toThrow(/too long/);
    expect(() => validateFoodRequest({ image: { media: 'image/gif', data: 'AAAA' } })).toThrow(/JPEG, PNG or WebP/);
    expect(() => validateFoodRequest({ image: { media: 'image/jpeg', data: 'not base64!' } })).toThrow();
    expect(validateFoodRequest({ text: ' 3 boiled eggs ', localTime: '08:15', weightKg: 72 })).toEqual({ text: '3 boiled eggs', image: null, localTime: '08:15', weightKg: 72 });
    expect(validateFoodRequest({ text: 'run', localTime: 'evil', weightKg: 9999 })).toMatchObject({ localTime: '', weightKg: null });
  });
});
