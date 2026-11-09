// AI meal / exercise logging: turns "3 boiled eggs, 2 bread slices" or a photo
// into structured items with calories, macros and detailed nutrients.
//
// The result is an ESTIMATE that the app shows for review before anything is
// saved; items are flagged `estimated` so totals are never presented as exact.

import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { NUTRIENTS } from '../src/domain/nutrients';
import { AssistantError, assistantEnabled } from './assistant';

const MODEL = process.env.OA_MODEL ?? 'claude-opus-5-5';

const nutrientShape = Object.fromEntries(NUTRIENTS.map((n) => [n.key, z.number().nullable()])) as Record<
  (typeof NUTRIENTS)[number]['key'],
  z.ZodNullable<z.ZodNumber>
>;

export const FoodAnalysisSchema = z.object({
  kind: z.enum(['meal', 'exercise', 'unclear']),
  title: z.string(),
  meal_type: z.enum(['breakfast', 'lunch', 'snacks', 'dinner', 'drinks']).nullable(),
  items: z.array(
    z.object({
      name: z.string(),
      quantity: z.string(),
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

const SYSTEM = `You turn a short description and/or a photo of what someone ate or did into a structured log entry for a personal fitness tracker.

Rules:
- kind = "meal" for food or drink, "exercise" for physical activity, "unclear" if it is neither or you cannot tell. For "unclear", return no items, exercise null, and say in assumptions what you need.
- Meals: one item per distinct food, using the quantity the user gave. When a quantity is missing, assume one typical serving, write that serving in "quantity", and mention it in assumptions. Recognise regional dishes, including Indian home cooking (roti, paratha, dal, sabzi, idli, dosa, gujiya, etc.).
- All numbers are for the stated quantity of that item, not per 100 g. Use typical values from standard food-composition data (e.g. USDA, IFCT). Estimate realistically; do not round everything to the same values.
- Detailed nutrients: give your best estimate for each; use null only when a value is genuinely unknowable for that food (not as a shortcut). Units are in each key's suffix (g, mg, ug = micrograms). water_g is the water contained in the food or drink.
- confidence: "high" for well-defined items (e.g. 1 large boiled egg), "medium" for typical home recipes, "low" when the portion or recipe varies a lot or the photo is unclear.
- title: a short name for the whole entry, e.g. "Boiled Eggs and Bread".
- meal_type: infer from the food and the user's local time if possible, else null.
- Exercise: fill exercise with type, duration and distance as described. calories_burned only if body weight is provided or the user stated it, else null. items must be empty.
- assumptions: one or two short sentences on portions or recipes you assumed. No health advice, no judgement of the food.`;

let client: Anthropic | null = null;

const ALLOWED_MEDIA = ['image/jpeg', 'image/png', 'image/webp'] as const;
type Media = (typeof ALLOWED_MEDIA)[number];

export function validateFoodRequest(body: unknown): { text: string; image: { media: Media; data: string } | null; localTime: string; weightKg: number | null } {
  const b = (body ?? {}) as { text?: unknown; image?: unknown; localTime?: unknown; weightKg?: unknown };
  const text = typeof b.text === 'string' ? b.text.trim() : '';
  if (text.length > 1000) throw new AssistantError(400, 'Description is too long');
  let image: { media: Media; data: string } | null = null;
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

export async function analyzeFood(req: ReturnType<typeof validateFoodRequest>): Promise<FoodAnalysis> {
  if (!assistantEnabled()) throw new AssistantError(503, 'AI logging is not configured on this server (ANTHROPIC_API_KEY)');
  client ??= new Anthropic();
  const context = [
    req.localTime ? `User's local time: ${req.localTime}.` : '',
    req.weightKg ? `User's body weight: ${req.weightKg} kg.` : '',
    req.text ? `User wrote: """${req.text}"""` : 'No description; use the photo.',
  ]
    .filter(Boolean)
    .join('\n');
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (req.image) content.push({ type: 'image', source: { type: 'base64', media_type: req.image.media, data: req.image.data } });
  content.push({ type: 'text', text: context });

  try {
    const res = await client.beta.messages.parse({
      model: MODEL,
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
