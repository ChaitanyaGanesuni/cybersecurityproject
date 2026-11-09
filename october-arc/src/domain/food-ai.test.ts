import { describe, expect, it } from 'vitest';
import { FoodAnalysisSchema, validateFoodRequest } from '../../server/food';
import { toFoodItems, type FoodAnalysis } from '../data/ai';
import { NUTRIENT_KEYS, sumNutrients } from './nutrients';
import type { Meal } from './types';

const nutrients = (over: Record<string, number | null> = {}) =>
  Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, over[k] ?? null])) as FoodAnalysis['items'][number]['nutrients'];

const eggsAndBread: FoodAnalysis = {
  kind: 'meal',
  title: 'Boiled Eggs and Bread',
  meal_type: 'breakfast',
  items: [
    { name: 'Boiled eggs', quantity: '3 large', calories: 234.4, protein_g: 18.93, carbs_g: 1.7, fat_g: 15.9, confidence: 'high', nutrients: nutrients({ vitamin_b12_ug: 1.67, cholesterol_mg: 558, sodium_mg: 186 }) },
    { name: 'Bread slices', quantity: '2 slices', calories: 160, protein_g: 6, carbs_g: 30, fat_g: 2, confidence: 'medium', nutrients: nutrients({ fiber_g: 1.6, sodium_mg: 300 }) },
  ],
  exercise: null,
  assumptions: 'Assumed large eggs and white sandwich bread.',
};

describe('AI food logging', () => {
  it('the structured-output schema accepts a full estimate and rejects a malformed one', () => {
    expect(FoodAnalysisSchema.safeParse(eggsAndBread).success).toBe(true);
    const bad = { ...eggsAndBread, items: [{ ...eggsAndBread.items[0], nutrients: { fiber_g: 1 } }] };
    expect(FoodAnalysisSchema.safeParse(bad).success).toBe(false);
  });

  it('turns an estimate into diary items flagged as estimates, dropping unknown nutrients', () => {
    const items = toFoodItems(eggsAndBread);
    expect(items[0]).toMatchObject({ name: 'Boiled eggs', calories: 234, protein: 18.9, estimated: true });
    expect(items[0].nutrients).toEqual({ vitamin_b12_ug: 1.7, cholesterol_mg: 558, sodium_mg: 186 });
  });

  it('sums detailed nutrients across meals and reports how much is covered', () => {
    const meal = (items: Meal['items']): Meal => ({ id: 'm', updatedAt: 0, date: '2026-11-09', mealType: 'lunch', at: 0, items });
    const t = sumNutrients([meal(toFoodItems(eggsAndBread)), meal([{ name: 'Chai', quantity: '1 cup' }])]);
    expect(t.values.sodium_mg).toBe(486);
    expect(t.values.fiber_g).toBe(1.6);
    expect(t).toMatchObject({ itemsWithDetail: 2, items: 3, estimatedItems: 2 });
  });

  it('validates requests before anything is sent to the model', () => {
    expect(() => validateFoodRequest({})).toThrow(/Describe what you ate/);
    expect(() => validateFoodRequest({ text: 'x'.repeat(1001) })).toThrow(/too long/);
    expect(() => validateFoodRequest({ image: { media: 'image/gif', data: 'AAAA' } })).toThrow(/JPEG, PNG or WebP/);
    expect(() => validateFoodRequest({ image: { media: 'image/jpeg', data: 'not base64!' } })).toThrow();
    expect(validateFoodRequest({ text: ' 3 boiled eggs ', localTime: '08:15', weightKg: 72 })).toEqual({ text: '3 boiled eggs', image: null, localTime: '08:15', weightKg: 72 });
    expect(validateFoodRequest({ text: 'run', localTime: 'evil', weightKg: 9999 })).toMatchObject({ localTime: '', weightKg: null });
  });
});
