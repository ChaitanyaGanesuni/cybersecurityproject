// Which AI provider powers AI food logging and the cloud assistant.
//
//   OA_AI_PROVIDER=gemini   Google Gemini (free tier available) — needs GEMINI_API_KEY
//   OA_AI_PROVIDER=claude   Anthropic Claude — needs ANTHROPIC_API_KEY
//
// Without OA_AI_PROVIDER: Gemini if GEMINI_API_KEY is set, else Claude if
// ANTHROPIC_API_KEY is set, else AI features are off.

import { ApiError, GoogleGenAI, ThinkingLevel, type GenerateContentParameters, type GenerateContentResponse } from '@google/genai';

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
 * Measured on a free-tier key (Nov 2026): demand swings minute to minute, so
 * any one model is often busy (503) or slow (504), and free quotas are per
 * model. Older models (2.5) are closed to new users; "-latest" aliases exist
 * only on v1beta, not the v1 API the SDK uses.
 */
export const GEMINI_MODELS = (process.env.GEMINI_MODEL ?? 'gemini-3.6-flash,gemini-3.8-flash,gemini-3.1-flash-lite,gemini-3.5-flash-lite')
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);

/** Give up on one model after this long and try the next. */
const ATTEMPT_TIMEOUT_MS = 30_000;
/** Stop starting new attempts after this long, so the user isn't left waiting. */
const TOTAL_BUDGET_MS = 75_000;

let gemini: GoogleGenAI | null = null;
export function geminiClient(): GoogleGenAI {
  // GEMINI_BASE_URL is optional (e.g. a corporate gateway); default is Google's endpoint.
  gemini ??= new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: { timeout: ATTEMPT_TIMEOUT_MS, ...(process.env.GEMINI_BASE_URL ? { baseUrl: process.env.GEMINI_BASE_URL } : {}) },
  });
  return gemini;
}

const isTimeout = (e: unknown) => e instanceof Error && (e.name === 'AbortError' || e.name === 'TimeoutError' || /timed? ?out|aborted/i.test(e.message));

/** Busy (500/503/504), out of quota for this model (429), unavailable (404) or timed out: try the next one. */
export const tryNextModel = (e: unknown) => (e instanceof ApiError && [404, 429, 500, 503, 504].includes(e.status)) || isTimeout(e);

/** Low thinking keeps Gemini 3 fast for structured extraction and chat; other models keep their defaults. */
const thinkingFor = (model: string) => (/^gemini-3/.test(model) ? { thinkingLevel: ThinkingLevel.LOW } : undefined);

/**
 * generateContent with model fallback. Throws the last error if every model
 * fails (or the time budget runs out); other errors (bad key, invalid
 * request) are thrown immediately.
 */
export async function geminiGenerate(
  params: Omit<GenerateContentParameters, 'model'>,
  models: string[] = GEMINI_MODELS,
  call: (p: GenerateContentParameters) => Promise<GenerateContentResponse> = (p) => geminiClient().models.generateContent(p),
): Promise<GenerateContentResponse & { modelUsed: string }> {
  const started = Date.now();
  let last: unknown;
  for (const model of models) {
    if (last && Date.now() - started > TOTAL_BUDGET_MS - ATTEMPT_TIMEOUT_MS / 2) break;
    const thinkingConfig = params.config?.thinkingConfig ?? thinkingFor(model);
    try {
      const res = await call({ ...params, model, config: { ...params.config, ...(thinkingConfig ? { thinkingConfig } : {}) } });
      return Object.assign(res, { modelUsed: model });
    } catch (e) {
      last = e;
      if (!tryNextModel(e)) throw e;
      console.warn(`[gemini] ${model} unavailable (${e instanceof ApiError ? e.status : 'timeout'}), trying next model`);
    }
  }
  throw last;
}
