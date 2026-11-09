// AI meal / exercise logging: turns "3 boiled eggs, 2 bread slices" or a photo
// into structured items with calories, macros and detailed nutrients.
//
// Pipeline:
//   1. An AI model (Gemini by default, or Claude) splits the entry into foods
//      with gram weights, a USDA-style search term, and its own estimate.
//   2. For standard foods, USDA FoodData Central lab values replace the
//      estimate, scaled to the grams (source "usda").
//   3. Anything USDA doesn't have (e.g. home-cooked regional dishes) keeps the
//      AI estimate (source "estimate").
// The app shows the result for review before anything is saved.

import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { ApiError as GeminiApiError } from '@google/genai';
import { z } from 'zod';
import { NUTRIENTS, NUTRIENT_KEYS, type NutrientKey } from '../src/domain/nutrients';
import { AssistantError } from './assistant';
import { aiProvider, geminiGenerate, tryNextModel } from './ai-provider';
import { per100g, searchFood, usdaEnabled } from './usda';

const CLAUDE_MODEL = process.env.OA_MODEL ?? 'claude-opus-5-5';

const nutrientShape = Object.fromEntries(NUTRIENTS.map((n) => [n.key, z.number().nullable()])) as Record<
  NutrientKey,
  z.ZodNullable<z.ZodNumber>
>;

/** What the AI model returns. */
export const FoodAnalysisSchema = z.object({
  kind: z.enum(['meal', 'exercise', 'unclear']),
  title: z.string(),
  meal_type: z.enum(['breakfast', 'lunch', 'snacks', 'dinner', 'drinks']).nullable(),
  items: z.array(
    z.object({
      name: z.string(),
      quantity: z.string(),
      grams: z.number(),
      usda_query: z.string().nullable(),
      calories: z.number(),
      protein_g: z.number(),
      carbs_g: z.number(),
      fat_g: z.number(),
      confidence: z.enum(['low', 'medium', 'high']),
      nutrients: z.object(nutrientShape),
    }),
  ),
  exercise: z
    .object({
      type: z.enum(['walking', 'running', 'cycling', 'gym', 'yoga', 'sports', 'home', 'other']),
      duration_min: z.number(),
      distance_km: z.number().nullable(),
      calories_burned: z.number().nullable(),
    })
    .nullable(),
  assumptions: z.string(),
});
export type FoodAnalysis = z.infer<typeof FoodAnalysisSchema>;

/** What the app receives: the analysis plus where each item's numbers came from. */
export type GroundedItem = FoodAnalysis['items'][number] & {
  source: 'usda' | 'estimate';
  usda_food: { fdc_id: number; description: string } | null;
};
export type GroundedAnalysis = Omit<FoodAnalysis, 'items'> & { items: GroundedItem[]; provider: 'gemini' | 'claude' };

const SYSTEM = `You turn a short description and/or a photo of what someone ate or did into a structured log entry for a personal fitness tracker.

Rules:
- kind = "meal" for food or drink, "exercise" for physical activity, "unclear" if it is neither or you cannot tell. For "unclear", return no items, exercise null, and say in assumptions what you need.
- Meals: one item per distinct food, using the quantity the user gave. When a quantity is missing, assume one typical serving, write that serving in "quantity", and mention it in assumptions. Recognise regional dishes, including Indian home cooking (roti, paratha, dal, sabzi, idli, dosa, gujiya, etc.).
- grams: your best estimate of the edible weight of the stated quantity in grams (for drinks, 1 ml = 1 g).
- usda_query: for a single-ingredient or standard food, a search term written the way USDA FoodData Central (SR Legacy) names foods, starting with the main food word, e.g. "Egg, whole, cooked, hard-boiled", "Bread, white, commercially prepared", "Rice, white, long-grain, regular, cooked", "Milk, whole", "Banana, raw". Use null for composite, home-cooked or regional dishes USDA will not list (e.g. methi paratha, gujiya, sambar, biryani).
- calories, protein_g, carbs_g, fat_g and nutrients are your own estimate for the stated quantity (not per 100 g), from standard food-composition data (e.g. USDA, IFCT). Estimate realistically.
- Detailed nutrients: give your best estimate for each; use null only when a value is genuinely unknowable for that food. Units are in each key's suffix (g, mg, ug = micrograms). water_g is the water contained in the food or drink.
- confidence: "high" for well-defined items (e.g. 1 large boiled egg), "medium" for typical home recipes, "low" when the portion or recipe varies a lot or the photo is unclear.
- title: a short name for the whole entry, e.g. "Boiled Eggs and Bread".
- meal_type: infer from the food and the user's local time if possible, else null.
- Exercise: fill exercise with type, duration and distance as described. calories_burned only if body weight is provided or the user stated it, else null. items must be empty.
- assumptions: one or two short sentences on portions or recipes you assumed. No health advice, no judgement of the food.`;

const ALLOWED_MEDIA = ['image/jpeg', 'image/png', 'image/webp'] as const;
type Media = (typeof ALLOWED_MEDIA)[number];
export type FoodRequest = { text: string; image: { media: Media; data: string } | null; localTime: string; weightKg: number | null };

export function validateFoodRequest(body: unknown): FoodRequest {
  const b = (body ?? {}) as { text?: unknown; image?: unknown; localTime?: unknown; weightKg?: unknown };
  const text = typeof b.text === 'string' ? b.text.trim() : '';
  if (text.length > 1000) throw new AssistantError(400, 'Description is too long');
  let image: FoodRequest['image'] = null;
  if (b.image != null) {
    const img = b.image as { media?: unknown; data?: unknown };
    if (!ALLOWED_MEDIA.includes(img.media as Media) || typeof img.data !== 'string' || !/^[A-Za-z0-9+/=]+$/.test(img.data)) {
      throw new AssistantError(400, 'Photo must be a JPEG, PNG or WebP image');
    }
    if (img.data.length > 4_000_000) throw new AssistantError(413, 'Photo is too large');
    image = { media: img.media as Media, data: img.data };
  }
  if (!text && !image) throw new AssistantError(400, 'Describe what you ate or add a photo');
  const localTime = typeof b.localTime === 'string' && /^\d{2}:\d{2}$/.test(b.localTime) ? b.localTime : '';
  const weightKg = typeof b.weightKg === 'number' && b.weightKg > 20 && b.weightKg < 400 ? b.weightKg : null;
  return { text, image, localTime, weightKg };
}

function userText(req: FoodRequest): string {
  return [
    req.localTime ? `User's local time: ${req.localTime}.` : '',
    req.weightKg ? `User's body weight: ${req.weightKg} kg.` : '',
    req.text ? `User wrote: """${req.text}"""` : 'No description; use the photo.',
  ]
    .filter(Boolean)
    .join('\n');
}

export async function analyzeFood(req: FoodRequest): Promise<GroundedAnalysis> {
  const provider = aiProvider();
  if (!provider) throw new AssistantError(503, 'AI logging is not configured on this server (set GEMINI_API_KEY)');
  const analysis = provider === 'gemini' ? await analyzeWithGemini(req) : await analyzeWithClaude(req);
  return { ...(await groundWithUsda(analysis)), provider };
}

// ---------- providers ----------

/** JSON Schema for Gemini's responseJsonSchema (it accepts $defs/$ref etc. but not $schema). */
export function geminiSchema(): Record<string, unknown> {
  const { $schema: _drop, ...schema } = z.toJSONSchema(FoodAnalysisSchema) as Record<string, unknown>;
  void _drop;
  return schema;
}

async function analyzeWithGemini(req: FoodRequest): Promise<FoodAnalysis> {
  const parts: { text?: string; inlineData?: { mimeType: string; data: string } }[] = [];
  if (req.image) parts.push({ inlineData: { mimeType: req.image.media, data: req.image.data } });
  parts.push({ text: userText(req) });
  let text: string | undefined;
  try {
    const res = await geminiGenerate({
      contents: [{ role: 'user', parts }],
      config: { systemInstruction: SYSTEM, responseMimeType: 'application/json', responseJsonSchema: geminiSchema() },
    });
    if (res.promptFeedback?.blockReason) throw new AssistantError(422, "Couldn't analyse that entry. Try describing it in words.");
    text = res.text;
  } catch (e) {
    if (e instanceof AssistantError) throw e;
    // Server-side log for diagnosis (Gemini error messages don't contain the key).
    console.warn('[gemini] food analysis failed:', (e as { status?: number }).status ?? '', String((e as Error).message).slice(0, 500));
    const busy = new AssistantError(503, 'Gemini is busy right now — try again in a minute, or log this one manually');
    if (e instanceof GeminiApiError) {
      if ([500, 503, 504].includes(e.status)) throw busy;
      if (e.status === 429) throw new AssistantError(429, 'The free Gemini quota is used up for now — try again later, or log this one manually');
      if (e.status === 400 || e.status === 401 || e.status === 403) throw new AssistantError(503, `Gemini rejected the request (${e.status}) — check GEMINI_API_KEY and GEMINI_MODEL`);
      throw new AssistantError(502, 'Gemini service error');
    }
    if (tryNextModel(e)) throw busy; // timed out on every model
    throw new AssistantError(502, 'Could not reach Gemini');
  }
  return parseModelJson(text);
}

/** Validate model output; never trust it to match the schema. */
export function parseModelJson(text: string | undefined): FoodAnalysis {
  if (!text) throw new AssistantError(502, 'The estimate came back empty — please try again');
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new AssistantError(502, 'The estimate came back malformed — please try again');
  }
  const parsed = FoodAnalysisSchema.safeParse(json);
  if (!parsed.success) throw new AssistantError(502, 'The estimate came back incomplete — please try again');
  return parsed.data;
}

let claude: Anthropic | null = null;

async function analyzeWithClaude(req: FoodRequest): Promise<FoodAnalysis> {
  claude ??= new Anthropic();
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (req.image) content.push({ type: 'image', source: { type: 'base64', media_type: req.image.media, data: req.image.data } });
  content.push({ type: 'text', text: userText(req) });
  try {
    const res = await claude.beta.messages.parse({
      model: CLAUDE_MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: betaZodOutputFormat(FoodAnalysisSchema) },
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content }],
    });
    if (res.stop_reason === 'refusal') throw new AssistantError(422, "Couldn't analyse that entry. Try describing it in words.");
    if (res.stop_reason === 'max_tokens' || !res.parsed_output) throw new AssistantError(502, 'The estimate came back incomplete — please try again');
    return res.parsed_output;
  } catch (e) {
    if (e instanceof AssistantError) throw e;
    if (e instanceof Anthropic.RateLimitError) throw new AssistantError(429, 'AI logging is busy — try again in a moment');
    if (e instanceof Anthropic.AuthenticationError) throw new AssistantError(503, 'The server’s AI key is invalid');
    if (e instanceof Anthropic.APIConnectionError) throw new AssistantError(502, 'Could not reach the AI service');
    if (e instanceof Anthropic.APIError) throw new AssistantError(502, 'AI service error');
    throw e;
  }
}

// ---------- USDA grounding ----------

const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

/**
 * Replace each item's estimate with USDA values where a matching generic food
 * exists. Lookup failures (network, quota) leave the AI estimate in place.
 */
export async function groundWithUsda(a: FoodAnalysis, search = searchFood): Promise<Omit<GroundedAnalysis, 'provider'>> {
  const items = await Promise.all(
    a.items.map(async (item): Promise<GroundedItem> => {
      const estimate: GroundedItem = { ...item, source: 'estimate', usda_food: null };
      if (!usdaEnabled() || !item.usda_query || !(item.grams > 0)) return estimate;
      try {
        const food = await search(item.usda_query);
        if (!food) return estimate;
        const v = per100g(food);
        if (v.calories == null) return estimate; // not enough data to trust it
        const k = item.grams / 100;
        // Only USDA's own figures, so a "USDA" item never hides AI guesses;
        // nutrients USDA doesn't list for this food stay unknown (null).
        const nutrients = { ...item.nutrients };
        for (const key of NUTRIENT_KEYS) {
          const val = v.nutrients[key];
          nutrients[key] = val != null ? round(val * k, 2) : null;
        }
        return {
          ...item,
          calories: Math.round(v.calories * k),
          protein_g: v.protein != null ? round(v.protein * k) : item.protein_g,
          carbs_g: v.carbs != null ? round(v.carbs * k) : item.carbs_g,
          fat_g: v.fat != null ? round(v.fat * k) : item.fat_g,
          nutrients,
          source: 'usda',
          usda_food: { fdc_id: food.fdcId, description: food.description },
        };
      } catch (e) {
        console.warn('[usda] lookup failed:', (e as Error).message);
        return estimate;
      }
    }),
  );
  return { ...a, items };
}
