import type { GenerateOptions, LLMMessage, LLMProvider } from "@gita/ai";

/**
 * Gemini adapter (Google Generative Language API) implementing the @gita/ai LLMProvider port.
 * Runs ONLY on the server; the API key never leaves this process. Default model is a free-tier
 * Gemini Flash. Swappable for any other LLMProvider without touching routes or domain logic.
 */
export class GeminiLLMProvider implements LLMProvider {
  readonly id = "gemini";
  private readonly base = "https://generativelanguage.googleapis.com/v1beta";

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly embedModel: string,
  ) {}

  private splitMessages(messages: LLMMessage[]) {
    const system = messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");
    const contents = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));
    return { system, contents };
  }

  async generate(messages: LLMMessage[], opts?: GenerateOptions): Promise<string> {
    const { system, contents } = this.splitMessages(messages);
    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: opts?.temperature ?? 0.4,
        maxOutputTokens: opts?.maxTokens ?? 1024,
      },
    };
    if (system) body.systemInstruction = { parts: [{ text: system }] };

    const res = await fetch(
      `${this.base}/models/${opts?.model ?? this.model}:generateContent?key=${this.apiKey}`,
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
    );
    if (!res.ok) throw new Error(`Gemini generate ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    return (
      json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? ""
    ).trim();
  }

  async *stream(messages: LLMMessage[], opts?: GenerateOptions): AsyncIterable<string> {
    // Simple streaming shim: yield the full response as one chunk. Can be upgraded to
    // streamGenerateContent later without changing callers.
    yield await this.generate(messages, opts);
  }

  async generateStructured<T>(
    messages: LLMMessage[],
    validate: (raw: unknown) => T,
    opts?: GenerateOptions,
  ): Promise<T> {
    const text = await this.generate(messages, opts);
    const cleaned = text.replace(/^```json\s*/i, "").replace(/```\s*$/i, "");
    return validate(JSON.parse(cleaned));
  }

  async embed(texts: string[]): Promise<number[][]> {
    const requests = texts.map((t) => ({
      model: `models/${this.embedModel}`,
      content: { parts: [{ text: t }] },
    }));
    const res = await fetch(
      `${this.base}/models/${this.embedModel}:batchEmbedContents?key=${this.apiKey}`,
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ requests }) },
    );
    if (!res.ok) throw new Error(`Gemini embed ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { embeddings?: { values: number[] }[] };
    return (json.embeddings ?? []).map((e) => e.values);
  }
}
