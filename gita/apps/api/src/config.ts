/**
 * Server configuration from environment. SECRETS LIVE HERE ONLY (spec §24) — never in the app.
 * Every value has a safe default so the server boots (with the mock provider) for local dev.
 */
export interface Config {
  port: number;
  host: string;
  /** Gemini (Google Generative Language API) key. Unset => mock provider (no network). */
  geminiApiKey: string | null;
  geminiModel: string;
  geminiEmbedModel: string;
  /** Optional FastAPI inference service base URL for embeddings/TTS. */
  inferenceUrl: string | null;
  corsOrigin: string;
}

export function loadConfig(): Config {
  const env = process.env;
  return {
    port: Number(env.PORT ?? 8080),
    host: env.HOST ?? "0.0.0.0",
    geminiApiKey: env.GEMINI_API_KEY?.trim() || null,
    geminiModel: env.GEMINI_MODEL ?? "gemini-2.0-flash",
    geminiEmbedModel: env.GEMINI_EMBED_MODEL ?? "text-embedding-004",
    inferenceUrl: env.INFERENCE_URL?.trim() || null,
    corsOrigin: env.CORS_ORIGIN ?? "*",
  };
}
