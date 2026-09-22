import { ContentRepository } from "./repository.js";

/**
 * Offline download state (spec §15). Text content ships bundled in the app, so every chapter's
 * content is offline from first launch. This module models the DOWNLOAD QUEUE for assets that are
 * fetched on demand — primarily generated long-form AUDIO packs (once a server/open-model TTS
 * provider produces cacheable files; device-native TTS is realtime and needs no download).
 *
 * Pure reducer so the queue, progress, and the four required states are fully unit-testable.
 */

export type DownloadStatus = "not_downloaded" | "queued" | "downloading" | "downloaded" | "failed";
export type DownloadKind = "content" | "audio";

export interface DownloadItem {
  id: string; // `${kind}:${chapterNumber}`
  kind: DownloadKind;
  chapterNumber: number;
  status: DownloadStatus;
  progress: number; // 0..1
}

export interface DownloadState {
  items: Record<string, DownloadItem>;
}

export const itemId = (kind: DownloadKind, chapterNumber: number) => `${kind}:${chapterNumber}`;

/** Content is bundled → every chapter's content item starts as `downloaded`. Audio starts absent. */
export function initialDownloadState(repo: ContentRepository): DownloadState {
  const items: Record<string, DownloadItem> = {};
  for (const ch of repo.listChapters()) {
    const id = itemId("content", ch.chapterNumber);
    items[id] = { id, kind: "content", chapterNumber: ch.chapterNumber, status: "downloaded", progress: 1 };
  }
  return { items };
}

export type DownloadAction =
  | { type: "enqueue"; kind: DownloadKind; chapterNumber: number }
  | { type: "start"; id: string }
  | { type: "progress"; id: string; progress: number }
  | { type: "complete"; id: string }
  | { type: "fail"; id: string }
  | { type: "remove"; id: string };

const set = (state: DownloadState, item: DownloadItem): DownloadState => ({
  items: { ...state.items, [item.id]: item },
});

export function downloadReducer(state: DownloadState, action: DownloadState | DownloadAction): DownloadState {
  if ("items" in action) return action; // allow replacing whole state
  switch (action.type) {
    case "enqueue": {
      const id = itemId(action.kind, action.chapterNumber);
      const existing = state.items[id];
      if (existing && existing.status === "downloaded") return state; // already have it
      return set(state, { id, kind: action.kind, chapterNumber: action.chapterNumber, status: "queued", progress: 0 });
    }
    case "start": {
      const it = state.items[action.id];
      return it ? set(state, { ...it, status: "downloading", progress: 0 }) : state;
    }
    case "progress": {
      const it = state.items[action.id];
      if (!it) return state;
      return set(state, { ...it, status: "downloading", progress: Math.max(0, Math.min(1, action.progress)) });
    }
    case "complete": {
      const it = state.items[action.id];
      return it ? set(state, { ...it, status: "downloaded", progress: 1 }) : state;
    }
    case "fail": {
      const it = state.items[action.id];
      return it ? set(state, { ...it, status: "failed" }) : state;
    }
    case "remove": {
      const next = { ...state.items };
      delete next[action.id];
      return { items: next };
    }
    default:
      return state;
  }
}

export function summarize(state: DownloadState): Record<DownloadStatus, number> {
  const counts: Record<DownloadStatus, number> = {
    not_downloaded: 0, queued: 0, downloading: 0, downloaded: 0, failed: 0,
  };
  for (const it of Object.values(state.items)) counts[it.status]++;
  return counts;
}
