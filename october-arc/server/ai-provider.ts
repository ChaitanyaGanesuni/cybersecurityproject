// Which AI provider powers AI food logging and the cloud assistant.
//
//   OA_AI_PROVIDER=gemini   Google Gemini (free tier available) — needs GEMINI_API_KEY
//   OA_AI_PROVIDER=claude   Anthropic Claude — needs ANTHROPIC_API_KEY
//
// Without OA_AI_PROVIDER: Gemini if GEMINI_API_KEY is set, else Claude if
// ANTHROPIC_API_KEY is set, else AI features are off.

import { ApiError, GoogleGenAI, type GenerateContentParameters, type GenerateContentResponse } from '@google/genai';

export type AiProvider = 'gemini' | 'claude';

export function aiProvider(): AiProvider | null {
  const wanted = process.env.OA_AI_PROVIDER?.toLowerCase();
  const hasGemini = !!process.env.GEMINI_API_KEY;
  const hasClaude = !!process.env.ANTHROPIC_API_KEY;
  if (wanted === 'gemini') return hasGemini ? 'gemini' : null;
  if (wanted === 'claude' || wanted === 'anthropic') return hasClaude ? 'claude' : null;
  return hasGemini ? 'gemini' : hasClaude ? 'claude' : null;
}

/**
 * Gemini models to try, in order (comma-separated GEMINI_MODEL overrides).
 * Stable Flash models on the v1 API; the "-latest" aliases exist only on
 * v1beta. Free-tier quotas are per model, and busy models return 503, so a
 * fallback model keeps logging working.
 */
export const GEMINI_MODELS = (process.env.GEMINI_MODEL ?? 'gemini-3.8-flash,gemini-3.6-flash,gemini-2.5-flash')
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);

let gemini: GoogleGenAI | null = null;
export function geminiClient(): GoogleGenAI {
  // GEMINI_BASE_URL is optional (e.g. a corporate gateway); default is Google's endpoint.
  gemini ??= new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    // Busy models can stall; give up on one attempt and move on to the next model.
    httpOptions: { timeout: 40_000, ...(process.env.GEMINI_BASE_URL ? { baseUrl: process.env.GEMINI_BASE_URL } : {}) },
  });
  return gemini;
}

const isTimeout = (e: unknown) => e instanceof Error && (e.name === 'AbortError' || e.name === 'TimeoutError' || /timed? ?out|aborted/i.test(e.message));

/** Overloaded (503/500), out of quota for this model (429), unavailable (404) or timed out: try the next one. */
const tryNext = (e: unknown) => (e instanceof ApiError && [404, 429, 500, 503].includes(e.status)) || isTimeout(e);

/**
 * generateContent with model fallback. Throws the last error if every model
 * fails; other errors (bad key, invalid request) are thrown immediately.
 */
export async function geminiGenerate(
  params: Omit<GenerateContentParameters, 'model'>,
  models: string[] = GEMINI_MODELS,
): Promise<GenerateContentResponse & { modelUsed: string }> {
  let last: unknown;
  for (const model of models) {
    try {
      const res = await geminiClient().models.generateContent({ ...params, model });
      return Object.assign(res, { modelUsed: model });
    } catch (e) {
      last = e;
      if (!tryNext(e)) throw e;
      console.warn(`[gemini] ${model} unavailable (${e instanceof ApiError ? e.status : 'timeout'}), trying next model`);
    }
  }
  throw last;
}
