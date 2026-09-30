// Server persistence: SQLite (node:sqlite) with per-record AES-256-GCM
// encryption at rest. Passwords are hashed with scrypt; session tokens are
// random and only their SHA-256 hash is stored.

import { DatabaseSync } from 'node:sqlite';
import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const SYNCED_TABLES = new Set([
  'settings', 'arcs', 'water', 'steps', 'sleep', 'meals', 'mealTemplates', 'quality',
  'workouts', 'habits', 'habitCompletions', 'weights', 'checkins', 'protections',
]);

export interface Change {
  table: string;
  id: string;
  updatedAt: number;
  deleted: boolean;
  data: Record<string, unknown> | null;
}

const SESSION_TTL_MS = 30 * 86_400_000;

export class Store {
  private db: DatabaseSync;
  private key: Buffer;

  constructor(dir: string) {
    mkdirSync(dir, { recursive: true });
    this.key = loadKey(dir);
    this.db = new DatabaseSync(join(dir, 'october-arc.sqlite'));
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, pw_hash TEXT NOT NULL, created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS records (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        tbl TEXT NOT NULL, id TEXT NOT NULL, updated_at INTEGER NOT NULL, deleted INTEGER NOT NULL,
        payload BLOB, seq INTEGER NOT NULL,
        PRIMARY KEY (user_id, tbl, id)
      );
      CREATE INDEX IF NOT EXISTS records_seq ON records (user_id, seq);
    `);
  }

  // ---------- auth ----------

  createUser(email: string, password: string): string {
    const id = randomBytes(16).toString('hex');
    try {
      this.db.prepare('INSERT INTO users (id, email, pw_hash, created_at) VALUES (?, ?, ?, ?)').run(id, email, hashPassword(password), Date.now());
    } catch {
      throw new Error('exists');
    }
    return id;
  }

  verifyUser(email: string, password: string): string | null {
    const row = this.db.prepare('SELECT id, pw_hash FROM users WHERE email = ?').get(email) as { id: string; pw_hash: string } | undefined;
    // Always run scrypt so response time doesn't reveal whether the email exists.
    const ok = verifyPassword(password, row?.pw_hash ?? DUMMY_HASH);
    return row && ok ? row.id : null;
  }

  createSession(userId: string): string {
    const token = randomBytes(32).toString('base64url');
    this.db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(sha256(token), userId, Date.now() + SESSION_TTL_MS);
    this.db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
    return token;
  }

  userForToken(token: string): string | null {
    const row = this.db.prepare('SELECT user_id, expires_at FROM sessions WHERE token_hash = ?').get(sha256(token)) as { user_id: string; expires_at: number } | undefined;
    return row && row.expires_at > Date.now() ? row.user_id : null;
  }

  deleteSession(token: string) {
    this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
  }

  /** User-controlled deletion: removes the account, sessions and every record. */
  deleteUser(userId: string) {
    this.db.prepare('DELETE FROM records WHERE user_id = ?').run(userId);
    this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
    this.db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  }

  // ---------- sync ----------

  sync(userId: string, cursor: number, changes: Change[]): { cursor: number; changes: Change[] } {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const written = new Set<string>();
      const getRow = this.db.prepare('SELECT updated_at FROM records WHERE user_id = ? AND tbl = ? AND id = ?');
      const upsert = this.db.prepare(`
        INSERT INTO records (user_id, tbl, id, updated_at, deleted, payload, seq) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (user_id, tbl, id) DO UPDATE SET updated_at = excluded.updated_at, deleted = excluded.deleted, payload = excluded.payload, seq = excluded.seq`);
      let seq = (this.db.prepare('SELECT COALESCE(MAX(seq), 0) AS s FROM records WHERE user_id = ?').get(userId) as { s: number }).s;

      for (const c of changes) {
        const existing = getRow.get(userId, c.table, c.id) as { updated_at: number } | undefined;
        if (existing && existing.updated_at >= c.updatedAt) continue; // last write wins
        const payload = c.deleted ? null : this.encrypt(JSON.stringify(c.data), aad(userId, c.table, c.id));
        upsert.run(userId, c.table, c.id, c.updatedAt, c.deleted ? 1 : 0, payload, ++seq);
        written.add(`${c.table}:${c.id}`);
      }

      const rows = this.db.prepare('SELECT tbl, id, updated_at, deleted, payload FROM records WHERE user_id = ? AND seq > ? ORDER BY seq').all(userId, cursor) as {
        tbl: string; id: string; updated_at: number; deleted: number; payload: Uint8Array | null;
      }[];
      const out: Change[] = [];
      for (const r of rows) {
        if (written.has(`${r.tbl}:${r.id}`)) continue; // client already has these
        out.push({
          table: r.tbl,
          id: r.id,
          updatedAt: r.updated_at,
          deleted: !!r.deleted,
          data: r.payload ? JSON.parse(this.decrypt(Buffer.from(r.payload), aad(userId, r.tbl, r.id))) : null,
        });
      }
      this.db.exec('COMMIT');
      return { cursor: seq, changes: out };
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  private encrypt(plain: string, ad: Buffer): Buffer {
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', this.key, iv);
    c.setAAD(ad);
    const body = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
    return Buffer.concat([iv, c.getAuthTag(), body]);
  }

  private decrypt(blob: Buffer, ad: Buffer): string {
    const d = createDecipheriv('aes-256-gcm', this.key, blob.subarray(0, 12));
    d.setAAD(ad);
    d.setAuthTag(blob.subarray(12, 28));
    return Buffer.concat([d.update(blob.subarray(28)), d.final()]).toString('utf8');
  }
}

const aad = (u: string, t: string, id: string) => Buffer.from(`${u}|${t}|${id}`);
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

function hashPassword(pw: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

function verifyPassword(pw: string, stored: string): boolean {
  const [, saltB64, hashB64] = stored.split('$');
  const expected = Buffer.from(hashB64, 'base64');
  const actual = scryptSync(pw, Buffer.from(saltB64, 'base64'), expected.length, { N: 16384, r: 8, p: 1 });
  return timingSafeEqual(expected, actual);
}

const DUMMY_HASH = hashPassword(randomBytes(12).toString('hex'));

/** Encryption key: OA_DATA_KEY (base64, 32 bytes) or a generated key file readable only by the server user. */
function loadKey(dir: string): Buffer {
  if (process.env.OA_DATA_KEY) {
    const k = Buffer.from(process.env.OA_DATA_KEY, 'base64');
    if (k.length !== 32) throw new Error('OA_DATA_KEY must be 32 bytes, base64-encoded');
    return k;
  }
  const file = join(dir, 'data.key');
  if (!existsSync(file)) {
    writeFileSync(file, randomBytes(32).toString('base64'), { mode: 0o600 });
    console.warn(`[october-arc] Generated a data encryption key at ${file}. Back it up — without it synced data can't be decrypted. Set OA_DATA_KEY to manage it yourself.`);
  }
  chmodSync(file, 0o600);
  return Buffer.from(readFileSync(file, 'utf8').trim(), 'base64');
}
