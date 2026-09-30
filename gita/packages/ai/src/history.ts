import type { VerseRef } from "@gita/contracts";
import type { LLMMessage } from "./provider.js";

/** A citation attached to an AI message (spec §8: "Sources: Chapter X, Verse Y"). */
export interface Citation {
  chapterNumber: number;
  verseNumber: number;
}

export interface AIMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  createdAt: string;
}

export interface AIConversation {
  id: string;
  title: string;
  /** Optional verse the conversation is anchored to ("Ask about this verse"). */
  verseContext: VerseRef | null;
  messages: AIMessage[];
}

/**
 * Trim conversation history to the last `maxTurns` user+assistant pairs to keep token cost bounded
 * (spec §25). Older turns are dropped here; a running summary can be prepended by the caller.
 */
export function trimHistory(messages: LLMMessage[], maxTurns = 6): LLMMessage[] {
  const maxMessages = maxTurns * 2;
  return messages.length <= maxMessages ? messages : messages.slice(-maxMessages);
}

/** Convert stored conversation messages into LLM history (roles the model understands). */
export function toLLMHistory(messages: AIMessage[]): LLMMessage[] {
  return messages.map((m) => ({ role: m.role, content: m.content }));
}
