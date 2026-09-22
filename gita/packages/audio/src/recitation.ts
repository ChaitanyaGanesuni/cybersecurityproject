/**
 * Sanskrit recitation controls (spec §13), kept distinct from ordinary narration.
 * Repeat / repeat-3× / slow / normal are expressed as a repeat count + a speed, which the
 * player expands into a queue.
 */
import type { QueueItem } from "./playback.js";

export type RecitationSpeed = "slow" | "normal";

export const RECITATION_SPEED_VALUE: Record<RecitationSpeed, number> = {
  slow: 0.7,
  normal: 1,
};

export interface RecitationOptions {
  repeat: 1 | 3;
  speed: RecitationSpeed;
}

export const defaultRecitationOptions: RecitationOptions = { repeat: 1, speed: "normal" };

/** Expand a single recitation chunk-set into a repeated queue (e.g. "repeat 3 times"). */
export function expandRecitationQueue(base: QueueItem[], repeat: 1 | 3): QueueItem[] {
  if (repeat === 1) return base;
  const out: QueueItem[] = [];
  for (let r = 0; r < repeat; r++) {
    for (const item of base) {
      out.push({ ...item, index: out.length });
    }
  }
  return out;
}
