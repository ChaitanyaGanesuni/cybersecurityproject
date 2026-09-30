/**
 * Pure playback state machine (spec §11, §12). The RN layer (react-native-track-player) drives
 * it with events; keeping the logic pure makes play/pause/seek/skip/speed and — crucially —
 * resume fully unit-testable without any audio hardware.
 */

export const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5, 1.75, 2] as const;
export type Speed = (typeof SPEED_OPTIONS)[number];

export type SectionType = "verse" | "explanation" | "chapter" | "recitation";
export type PlaybackStatus = "idle" | "playing" | "paused";

export interface QueueItem {
  index: number;
  hash: string; // audioChunkId
  durationSeconds: number;
}

export interface PlaybackState {
  status: PlaybackStatus;
  chapterNumber: number | null;
  verseNumber: number | null;
  sectionType: SectionType | null;
  queue: QueueItem[];
  currentIndex: number;
  positionSeconds: number; // within the current chunk
  speed: Speed;
}

export const initialPlaybackState: PlaybackState = {
  status: "idle",
  chapterNumber: null,
  verseNumber: null,
  sectionType: null,
  queue: [],
  currentIndex: 0,
  positionSeconds: 0,
  speed: 1,
};

export type PlaybackAction =
  | {
      type: "load";
      queue: QueueItem[];
      chapterNumber: number;
      verseNumber: number | null;
      sectionType: SectionType;
      startIndex?: number;
      startPosition?: number;
    }
  | { type: "play" }
  | { type: "pause" }
  | { type: "toggle" }
  | { type: "stop" }
  | { type: "seekWithinChunk"; seconds: number }
  | { type: "skipNext" }
  | { type: "skipPrev" }
  | { type: "setSpeed"; speed: Speed }
  | { type: "tick"; deltaSeconds: number }; // advance content time (auto-advances chunks)

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export function playbackReducer(state: PlaybackState, action: PlaybackAction): PlaybackState {
  switch (action.type) {
    case "load": {
      const startIndex = clamp(action.startIndex ?? 0, 0, Math.max(0, action.queue.length - 1));
      return {
        ...state,
        queue: action.queue,
        chapterNumber: action.chapterNumber,
        verseNumber: action.verseNumber,
        sectionType: action.sectionType,
        currentIndex: startIndex,
        positionSeconds: Math.max(0, action.startPosition ?? 0),
        status: "playing",
      };
    }
    case "play":
      return state.queue.length ? { ...state, status: "playing" } : state;
    case "pause":
      return { ...state, status: "paused" };
    case "toggle":
      return { ...state, status: state.status === "playing" ? "paused" : "playing" };
    case "stop":
      return { ...initialPlaybackState, speed: state.speed };
    case "setSpeed":
      return { ...state, speed: action.speed };
    case "seekWithinChunk": {
      const dur = current(state)?.durationSeconds ?? 0;
      return { ...state, positionSeconds: clamp(action.seconds, 0, dur) };
    }
    case "skipNext": {
      if (state.currentIndex >= state.queue.length - 1) {
        return { ...state, positionSeconds: current(state)?.durationSeconds ?? 0, status: "paused" };
      }
      return { ...state, currentIndex: state.currentIndex + 1, positionSeconds: 0 };
    }
    case "skipPrev": {
      // Restart current chunk if >3s in, else go to previous.
      if (state.positionSeconds > 3 || state.currentIndex === 0) {
        return { ...state, positionSeconds: 0 };
      }
      return { ...state, currentIndex: state.currentIndex - 1, positionSeconds: 0 };
    }
    case "tick": {
      if (state.status !== "playing" || state.queue.length === 0) return state;
      let idx = state.currentIndex;
      let pos = state.positionSeconds + action.deltaSeconds;
      // Cascade across chunk boundaries.
      while (idx < state.queue.length) {
        const dur = state.queue[idx]!.durationSeconds;
        if (pos < dur) break;
        pos -= dur;
        idx++;
      }
      if (idx >= state.queue.length) {
        // Reached the end.
        return {
          ...state,
          currentIndex: state.queue.length - 1,
          positionSeconds: state.queue[state.queue.length - 1]!.durationSeconds,
          status: "paused",
        };
      }
      return { ...state, currentIndex: idx, positionSeconds: pos };
    }
    default:
      return state;
  }
}

export function current(state: PlaybackState): QueueItem | null {
  return state.queue[state.currentIndex] ?? null;
}

/** Total content duration across the queue. */
export function totalSeconds(state: PlaybackState): number {
  return state.queue.reduce((s, q) => s + q.durationSeconds, 0);
}

/** Elapsed content time across the whole queue (spec §12: elapsed/remaining). */
export function elapsedSeconds(state: PlaybackState): number {
  let e = 0;
  for (let i = 0; i < state.currentIndex && i < state.queue.length; i++) {
    e += state.queue[i]!.durationSeconds;
  }
  return e + state.positionSeconds;
}

export function remainingSeconds(state: PlaybackState): number {
  return Math.max(0, totalSeconds(state) - elapsedSeconds(state));
}

/** Persisted resume snapshot (spec §11): survives app close. */
export interface ResumeSnapshot {
  chapterNumber: number;
  verseNumber: number | null;
  sectionType: SectionType;
  audioChunkId: string; // = current chunk hash
  positionSeconds: number;
}

export function deriveResume(state: PlaybackState): ResumeSnapshot | null {
  const cur = current(state);
  if (!cur || state.chapterNumber === null || state.sectionType === null) return null;
  return {
    chapterNumber: state.chapterNumber,
    verseNumber: state.verseNumber,
    sectionType: state.sectionType,
    audioChunkId: cur.hash,
    positionSeconds: state.positionSeconds,
  };
}

/** Rehydrate a loaded queue to a saved resume point (matches chunk by hash). */
export function applyResume(
  queue: QueueItem[],
  snapshot: ResumeSnapshot,
): { startIndex: number; startPosition: number } {
  const idx = queue.findIndex((q) => q.hash === snapshot.audioChunkId);
  return idx >= 0
    ? { startIndex: idx, startPosition: snapshot.positionSeconds }
    : { startIndex: 0, startPosition: 0 };
}

/** mm:ss formatting for the player UI. */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}
