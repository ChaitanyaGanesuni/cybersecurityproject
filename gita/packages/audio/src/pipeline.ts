import type { LanguageCode } from "@gita/contracts";
import { segmentSentences } from "./segment.js";
import { chunkSentences } from "./chunk.js";
import { audioHash } from "./hash.js";
import type { AudioCache } from "./cache.js";
import {
  UnsupportedSynthesisError,
  type AudioKind,
  type AudioProvider,
  type SynthesizedAudio,
} from "./provider.js";

/**
 * Long-form audio pipeline (spec §10, §11, §14):
 *   text -> segment -> chunk -> per-chunk audioHash -> cache hit? reuse : synthesize+store
 * Produces an ordered manifest the player consumes as a gapless queue.
 */

export interface PlanChunk {
  index: number;
  text: string;
  hash: string;
}

export interface ChunkPlan {
  lang: LanguageCode;
  kind: AudioKind;
  voiceId: string;
  providerId: string;
  speed: number;
  chunks: PlanChunk[];
}

export interface SynthOptions {
  lang: LanguageCode;
  voiceId: string;
  speed: number;
  kind: AudioKind;
}

/** Pure planning step: deterministic chunking + hashing. No I/O. */
export function buildChunkPlan(
  text: string,
  provider: AudioProvider,
  opts: SynthOptions,
): ChunkPlan {
  const caps = provider.getCapabilities();
  const sentences = segmentSentences(text, opts.lang);
  const chunkTexts = chunkSentences(sentences, caps.maxChars);
  const chunks: PlanChunk[] = chunkTexts.map((t, index) => ({
    index,
    text: t,
    hash: audioHash({
      text: t,
      voiceId: opts.voiceId,
      providerId: provider.id,
      lang: opts.lang,
      speed: opts.speed,
    }),
  }));
  return {
    lang: opts.lang,
    kind: opts.kind,
    voiceId: opts.voiceId,
    providerId: provider.id,
    speed: opts.speed,
    chunks,
  };
}

export interface ManifestItem {
  index: number;
  hash: string;
  audio: SynthesizedAudio;
  fromCache: boolean;
}

export interface SynthResult {
  items: ManifestItem[];
  generated: number;
  reused: number;
}

/**
 * Execute a plan against a data-producing provider and the cache. Cache hits are reused;
 * misses are synthesized once and stored. Idempotent: re-running a plan generates nothing new.
 */
export async function synthesizePlan(
  plan: ChunkPlan,
  provider: AudioProvider,
  cache: AudioCache,
): Promise<SynthResult> {
  if (!provider.getCapabilities().producesData) {
    throw new UnsupportedSynthesisError(provider.id);
  }
  const items: ManifestItem[] = [];
  let generated = 0;
  let reused = 0;

  for (const chunk of plan.chunks) {
    const cached = await cache.get(chunk.hash);
    if (cached) {
      items.push({ index: chunk.index, hash: chunk.hash, audio: cached, fromCache: true });
      reused++;
      continue;
    }
    const audio = await provider.synthesize({
      text: chunk.text,
      lang: plan.lang,
      voiceId: plan.voiceId,
      speed: plan.speed,
      kind: plan.kind,
    });
    await cache.put(chunk.hash, audio);
    items.push({ index: chunk.index, hash: chunk.hash, audio, fromCache: false });
    generated++;
  }

  return { items, generated, reused };
}
