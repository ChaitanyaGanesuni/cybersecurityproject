// Offline-first sync.
//
// Every local write is stored in IndexedDB and a key is added to the outbox
// (repo.ts). When online and signed in, the outbox is pushed to the server and
// remote changes since our cursor are pulled. Conflicts resolve per record by
// last-write-wins on `updatedAt`; a pending local edit is never overwritten by
// an older remote one. Deletes travel as tombstones. Meal photos never sync.

import { db, SYNCED_TABLES, type SyncedTable } from './db';
import { api, getSession } from './api';
import { onLocalWrite } from './repo';

export interface Change {
  table: SyncedTable;
  id: string;
  updatedAt: number;
  deleted: boolean;
  data: Record<string, unknown> | null;
}

export interface SyncStatus {
  state: 'off' | 'idle' | 'syncing' | 'offline' | 'error';
  lastSyncAt: number | null;
  pending: number;
  error?: string;
}

let status: SyncStatus = { state: 'off', lastSyncAt: null, pending: 0 };
const subs = new Set<(s: SyncStatus) => void>();
export const getSyncStatus = () => status;
export function subscribeSync(fn: (s: SyncStatus) => void) {
  subs.add(fn);
  return () => void subs.delete(fn);
}
function setStatus(p: Partial<SyncStatus>) {
  status = { ...status, ...p };
  subs.forEach((f) => f(status));
}

function stripLocalOnly(table: SyncedTable, rec: Record<string, unknown>) {
  if (table === 'meals' && 'photo' in rec) {
    const { photo: _p, ...rest } = rec;
    void _p;
    return rest;
  }
  return rec;
}

let running: Promise<void> | null = null;

export function syncNow(): Promise<void> {
  if (!running) running = doSync().finally(() => (running = null));
  return running;
}

async function doSync() {
  const session = getSession();
  const pending = await db.outbox.count();
  if (!session) return setStatus({ state: 'off', pending });
  if (!navigator.onLine) return setStatus({ state: 'offline', pending });
  setStatus({ state: 'syncing', pending });
  try {
    const outbox = await db.outbox.toArray();
    const changes: Change[] = [];
    for (const item of outbox) {
      if (!SYNCED_TABLES.includes(item.table)) continue;
      const rec = (await db.table(item.table).get(item.id)) as Record<string, unknown> | undefined;
      changes.push({
        table: item.table,
        id: item.id,
        updatedAt: (rec?.updatedAt as number) ?? item.at,
        deleted: !rec,
        data: rec ? stripLocalOnly(item.table, rec) : null,
      });
    }
    const cursor = ((await db.meta.get('syncCursor'))?.value as number) ?? 0;
    const res = await api<{ cursor: number; changes: Change[] }>('/api/sync', { cursor, changes });

    await db.transaction('rw', [...SYNCED_TABLES.map((t) => db.table(t)), db.outbox, db.meta], async () => {
      for (const c of res.changes) {
        if (!SYNCED_TABLES.includes(c.table)) continue;
        const pendingLocal = await db.outbox.get(`${c.table}:${c.id}`);
        if (pendingLocal && pendingLocal.at > c.updatedAt) continue; // our newer edit wins
        const table = db.table(c.table);
        const local = (await table.get(c.id)) as Record<string, unknown> | undefined;
        const localAt = (local?.updatedAt as number) ?? 0;
        if (localAt > c.updatedAt) continue;
        if (c.deleted) await table.delete(c.id);
        else if (c.data) {
          const merged = c.table === 'meals' && local?.photo ? { ...c.data, photo: local.photo } : c.data;
          await table.put(merged);
        }
      }
      // Clear only outbox entries that haven't been touched again since we read them.
      for (const item of outbox) {
        const cur = await db.outbox.get(item.key);
        if (cur && cur.at === item.at) await db.outbox.delete(item.key);
      }
      await db.meta.put({ key: 'syncCursor', value: res.cursor });
    });
    setStatus({ state: 'idle', lastSyncAt: Date.now(), pending: await db.outbox.count(), error: undefined });
  } catch (e) {
    setStatus({ state: navigator.onLine ? 'error' : 'offline', error: (e as Error).message, pending: await db.outbox.count() });
  }
}

let started = false;
/** Wire up automatic sync: after local writes (debounced), on reconnect, and periodically. */
export function startSyncLoop() {
  if (started) return;
  started = true;
  let t: ReturnType<typeof setTimeout> | undefined;
  const soon = () => {
    clearTimeout(t);
    t = setTimeout(() => void syncNow(), 2000);
  };
  onLocalWrite(soon);
  window.addEventListener('online', () => void syncNow());
  window.addEventListener('offline', () => setStatus({ state: getSession() ? 'offline' : 'off' }));
  window.addEventListener('oa-session', () => {
    // A new account starts from scratch: push everything local, pull everything remote.
    void (async () => {
      if (getSession()) {
        await db.meta.put({ key: 'syncCursor', value: 0 });
        await queueEverything();
      }
      void syncNow();
    })();
  });
  setInterval(() => void syncNow(), 5 * 60_000);
  void syncNow();
}

/** Put every local record in the outbox (first sign-in on this device). */
async function queueEverything() {
  for (const t of SYNCED_TABLES) {
    const rows = (await db.table(t).toArray()) as { id: string; updatedAt: number }[];
    await db.outbox.bulkPut(rows.map((r) => ({ key: `${t}:${r.id}`, table: t, id: r.id, at: r.updatedAt })));
  }
}
