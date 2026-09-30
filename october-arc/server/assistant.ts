// Cloud assistant: proxies a question plus the user's compact data summary to
// Claude. The API key lives only on the server (ANTHROPIC_API_KEY).

import Anthropic from '@anthropic-ai/sdk';

const MODEL = process.env.OA_MODEL ?? 'claude-opus-5-5';

const SYSTEM = `You are the October Arc assistant: a warm, practical accountability companion inside a personal fitness and wellness consistency tracker.

How to answer:
- Use ONLY the user's data provided in the "User data" block for any statement about their progress, streaks or history. If the data doesn't contain something, say so plainly instead of guessing. Never invent numbers.
- Be supportive and specific. Never shame the user. Frame misses as recoverable and point to the smallest realistic next step given the time left today.
- Keep answers short and scannable for a phone screen: a few sentences or a brief list. Use metric units as the data does.
- Nutrition values: only cite values that are in the data. When suggesting meals, describe options without claiming precise calories or macros; tell the user to check labels or their usual portions.
- Workouts: offer simple, general routines with a note to go at their own pace and skip anything painful.
- You are not a medical professional. Do not diagnose, interpret symptoms, recommend medications or supplement doses, or give weight-loss targets or aggressive deficits. For anything that needs medical judgement (pain, injury, illness, pregnancy, eating disorders, medications, chronic conditions), briefly recommend consulting a qualified professional such as a doctor or registered dietitian.
- Streak rules for this user are in streak_rules: categories with policy "breaks" must be complete and the day score must reach min_day_score for the overall streak to continue.`;

let client: Anthropic | null = null;
export const assistantEnabled = () => !!process.env.ANTHROPIC_API_KEY;

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export class AssistantError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function validateChat(body: unknown): { messages: ChatTurn[]; context: unknown } {
  const b = body as { messages?: unknown; context?: unknown };
  if (!Array.isArray(b?.messages) || b.messages.length === 0 || b.messages.length > 20) throw new AssistantError(400, 'Invalid messages');
  const messages: ChatTurn[] = [];
  for (const m of b.messages as ChatTurn[]) {
    if ((m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string' || !m.content.trim() || m.content.length > 4000) {
      throw new AssistantError(400, 'Invalid message');
    }
    // Merge consecutive same-role turns so roles alternate.
    const last = messages[messages.length - 1];
    if (last && last.role === m.role) last.content += `\n\n${m.content}`;
    else messages.push({ role: m.role, content: m.content });
  }
  while (messages.length && messages[0].role !== 'user') messages.shift();
  if (!messages.length || messages[messages.length - 1].role !== 'user') throw new AssistantError(400, 'Last message must be from the user');
  const ctx = JSON.stringify(b.context ?? {});
  if (ctx.length > 40_000) throw new AssistantError(413, 'Context too large');
  return { messages, context: b.context ?? {} };
}

export async function ask(messages: ChatTurn[], context: unknown): Promise<string> {
  if (!assistantEnabled()) throw new AssistantError(503, 'Cloud assistant is not configured on this server');
  client ??= new Anthropic();
  try {
    const res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      system: [
        { type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: `User data (JSON, today is ${new Date().toISOString().slice(0, 10)}):\n${JSON.stringify(context)}` },
      ],
      messages,
    });
    if (res.stop_reason === 'refusal') {
      return "I can't help with that one. For health concerns, please check with a qualified professional. I'm happy to help with your logged goals, streaks and routines.";
    }
    const text = res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('\n').trim();
    return text || "Sorry, I couldn't come up with an answer. Try rephrasing?";
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) throw new AssistantError(429, 'Assistant is busy — try again in a moment');
    if (e instanceof Anthropic.AuthenticationError) throw new AssistantError(503, 'Assistant API key is invalid');
    if (e instanceof Anthropic.APIConnectionError) throw new AssistantError(502, 'Could not reach the assistant service');
    if (e instanceof Anthropic.APIError) throw new AssistantError(502, 'Assistant service error');
    throw e;
  }
}
