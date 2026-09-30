import type { SynthesizedAudio } from "./provider.js";

/**
 * Audio cache port (spec §14). On-device this is backed by the filesystem + a SQLite index;
 * tests use the in-memory implementation. Keyed by audioHash.
 */
export interface AudioCache {
  has(hash: string): Promise<boolean>;
  get(hash: string): Promise<SynthesizedAudio | null>;
  put(hash: string, audio: SynthesizedAudio): Promise<void>;
  delete(hash: string): Promise<void>;
}

export class InMemoryAudioCache implements AudioCache {
  private readonly map = new Map<string, SynthesizedAudio>();
  /** Test/observability counters. */
  hits = 0;
  misses = 0;

  async has(hash: string): Promise<boolean> {
    return this.map.has(hash);
  }
  async get(hash: string): Promise<SynthesizedAudio | null> {
    const v = this.map.get(hash) ?? null;
    if (v) this.hits++;
    else this.misses++;
    return v;
  }
  async put(hash: string, audio: SynthesizedAudio): Promise<void> {
    this.map.set(hash, audio);
  }
  async delete(hash: string): Promise<void> {
    this.map.delete(hash);
  }
  get size(): number {
    return this.map.size;
  }
}
