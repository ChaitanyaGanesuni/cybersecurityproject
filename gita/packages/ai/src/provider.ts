/**
 * LLM provider port (spec §26). Concrete models (Gemini free tier by default, or OpenAI, a local
 * Ollama, etc.) are adapters implementing this interface. IMPORTANT (spec §24): adapters that call
 * a hosted model with an API key run on the BACKEND — never in the mobile app. The app talks to a
 * backend endpoint; only the backend holds keys.
 */

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GenerateOptions {
  temperature?: number;
  maxTokens?: number;
  model?: string;
}

export interface LLMProvider {
  readonly id: string;
  generate(messages: LLMMessage[], opts?: GenerateOptions): Promise<string>;
  stream(messages: LLMMessage[], opts?: GenerateOptions): AsyncIterable<string>;
  /** Constrained generation validated by the caller's parser (used for quiz items, mode JSON). */
  generateStructured<T>(
    messages: LLMMessage[],
    validate: (raw: unknown) => T,
    opts?: GenerateOptions,
  ): Promise<T>;
  /** Embeddings for RAG (Phase 7). Kept on the same port for a single model abstraction. */
  embed(texts: string[]): Promise<number[][]>;
}

/**
 * Deterministic mock provider for tests and offline dev. `generate` returns a scripted response
 * derived from the last user message so behavior is predictable; `embed` returns a stable
 * pseudo-vector so RAG tests are reproducible without a network.
 */
export class MockLLMProvider implements LLMProvider {
  readonly id = "mock";
  constructor(private readonly responder: (messages: LLMMessage[]) => string = defaultResponder) {}

  async generate(messages: LLMMessage[]): Promise<string> {
    return this.responder(messages);
  }

  async *stream(messages: LLMMessage[]): AsyncIterable<string> {
    for (const word of this.responder(messages).split(" ")) yield word + " ";
  }

  async generateStructured<T>(messages: LLMMessage[], validate: (raw: unknown) => T): Promise<T> {
    return validate(JSON.parse(this.responder(messages)));
  }

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => pseudoVector(t, 16));
  }
}

function defaultResponder(messages: LLMMessage[]): string {
  const last = [...messages].reverse().find((m) => m.role === "user");
  return `MOCK: ${last?.content.slice(0, 80) ?? ""}`;
}

/** Deterministic unit-length-ish vector from text (stable across runs; for RAG tests). */
export function pseudoVector(text: string, dims: number): number[] {
  const v = new Array<number>(dims).fill(0);
  for (let i = 0; i < text.length; i++) {
    v[i % dims]! += (text.charCodeAt(i) % 31) - 15;
  }
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}
