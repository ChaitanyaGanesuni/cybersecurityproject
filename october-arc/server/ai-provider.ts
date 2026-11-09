// Which AI provider powers AI food logging and the cloud assistant.
//
//   OA_AI_PROVIDER=gemini   Google Gemini (free tier available) — needs GEMINI_API_KEY
//   OA_AI_PROVIDER=claude   Anthropic Claude — needs ANTHROPIC_API_KEY
//
// Without OA_AI_PROVIDER: Gemini if GEMINI_API_KEY is set, else Claude if
// ANTHROPIC_API_KEY is set, else AI features are off.

import { GoogleGenAI } from '@google/genai';

export type AiProvider = 'gemini' | 'claude';

export function aiProvider(): AiProvider | null {
  const wanted = process.env.OA_AI_PROVIDER?.toLowerCase();
  const hasGemini = !!process.env.GEMINI_API_KEY;
  const hasClaude = !!process.env.ANTHROPIC_API_KEY;
  if (wanted === 'gemini') return hasGemini ? 'gemini' : null;
  if (wanted === 'claude' || wanted === 'anthropic') return hasClaude ? 'claude' : null;
  return hasGemini ? 'gemini' : hasClaude ? 'claude' : null;
}

/** Gemini model; the "latest" alias follows Google's newest stable Flash model. */
export const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-flash-latest';

let gemini: GoogleGenAI | null = null;
export function geminiClient(): GoogleGenAI {
  // GEMINI_BASE_URL is optional (e.g. a corporate gateway); default is Google's endpoint.
  gemini ??= new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    ...(process.env.GEMINI_BASE_URL ? { httpOptions: { baseUrl: process.env.GEMINI_BASE_URL } } : {}),
  });
  return gemini;
}
