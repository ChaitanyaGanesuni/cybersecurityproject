// October Arc server (optional): accounts, encrypted sync, cloud assistant,
// and static hosting of the built PWA. Zero framework — node:http only.
//
// Env:
//   PORT               default 8787
//   OA_DATA_DIR        default ./server/data
//   OA_DATA_KEY        base64 32-byte key for encryption at rest (else generated)
//   OA_CORS_ORIGIN     comma-separated origins allowed to call the API, e.g. https://localhost
//                      for the Android app (default: same-origin only)
//   ANTHROPIC_API_KEY  enables the cloud assistant
//   OA_MODEL           Claude model id (default claude-opus-5-5)

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store, SYNCED_TABLES, type Change } from './store';
import { AssistantError, ask, assistantEnabled, validateChat } from './assistant';

const here = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.env.PORT ?? 8787);
const store = new Store(process.env.OA_DATA_DIR ?? join(here, 'data'));
const DIST = resolve(here, '../dist');
// Comma-separated. The Android app's origin is https://localhost.
const CORS_ORIGINS = (process.env.OA_CORS_ORIGIN ?? '').split(',').map((o) => o.trim()).filter(Boolean);

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// ---------- tiny helpers ----------

async function readJson(req: IncomingMessage, limit = 5_000_000): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > limit) throw new HttpError(413, 'Request too large');
    chunks.push(c as Buffer);
  }
  if (!size) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Invalid JSON');
  }
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

function auth(req: IncomingMessage): { userId: string; token: string } {
  const h = req.headers.authorization ?? '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  const userId = token ? store.userForToken(token) : null;
  if (!userId) throw new HttpError(401, 'Please sign in again');
  return { userId, token };
}

// Simple fixed-window rate limiter (per process).
const hits = new Map<string, { n: number; reset: number }>();
function limit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const h = hits.get(key);
  if (!h || h.reset < now) hits.set(key, { n: 1, reset: now + windowMs });
  else if (++h.n > max) throw new HttpError(429, 'Too many attempts — please wait a few minutes');
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validChanges(x: unknown): Change[] {
  if (!Array.isArray(x) || x.length > 10_000) throw new HttpError(400, 'Invalid changes');
  return x.map((c) => {
    const ch = c as Change;
    if (!SYNCED_TABLES.has(ch.table) || typeof ch.id !== 'string' || !ch.id || ch.id.length > 200 || typeof ch.updatedAt !== 'number' || !Number.isFinite(ch.updatedAt)) {
      throw new HttpError(400, 'Invalid change');
    }
    const deleted = !!ch.deleted;
    if (!deleted && (typeof ch.data !== 'object' || ch.data === null || JSON.stringify(ch.data).length > 200_000)) throw new HttpError(400, 'Invalid record');
    return { table: ch.table, id: ch.id, updatedAt: ch.updatedAt, deleted, data: deleted ? null : ch.data };
  });
}

// ---------- routes ----------

async function api(req: IncomingMessage, res: ServerResponse, path: string) {
  const ip = req.socket.remoteAddress ?? '?';
  const m = req.method ?? 'GET';

  if (m === 'GET' && path === '/api/health') return send(res, 200, { ok: true, assistant: assistantEnabled() });

  if (m === 'POST' && (path === '/api/auth/register' || path === '/api/auth/login')) {
    const { email, password } = (await readJson(req, 10_000)) as { email?: string; password?: string };
    const e = String(email ?? '').trim().toLowerCase();
    const pw = String(password ?? '');
    limit(`auth:${ip}`, 20, 15 * 60_000);
    limit(`auth:${e}`, 10, 15 * 60_000);
    if (!EMAIL.test(e) || e.length > 254) throw new HttpError(400, 'Enter a valid email');
    if (pw.length < 10 || pw.length > 200) throw new HttpError(400, 'Password must be at least 10 characters');
    let userId: string | null;
    if (path.endsWith('register')) {
      try {
        userId = store.createUser(e, pw);
      } catch {
        throw new HttpError(409, 'An account with this email already exists');
      }
    } else {
      userId = store.verifyUser(e, pw);
      if (!userId) throw new HttpError(401, 'Email or password is incorrect');
    }
    return send(res, 200, { token: store.createSession(userId) });
  }

  if (m === 'POST' && path === '/api/auth/logout') {
    const { token } = auth(req);
    store.deleteSession(token);
    return send(res, 200, { ok: true });
  }

  if (m === 'DELETE' && path === '/api/account') {
    const { userId } = auth(req);
    store.deleteUser(userId);
    return send(res, 200, { ok: true });
  }

  if (m === 'POST' && path === '/api/sync') {
    const { userId } = auth(req);
    limit(`sync:${userId}`, 120, 60_000);
    const body = (await readJson(req)) as { cursor?: number; changes?: unknown };
    const cursor = Number.isInteger(body.cursor) && (body.cursor as number) >= 0 ? (body.cursor as number) : 0;
    return send(res, 200, store.sync(userId, cursor, validChanges(body.changes ?? [])));
  }

  if (m === 'POST' && path === '/api/assistant') {
    const { userId } = auth(req);
    limit(`ai:${userId}`, 30, 60 * 60_000);
    const { messages, context } = validateChat(await readJson(req, 100_000));
    return send(res, 200, { reply: await ask(messages, context) });
  }

  throw new HttpError(404, 'Not found');
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.ico': 'image/x-icon',
};

function serveStatic(res: ServerResponse, path: string) {
  if (!existsSync(DIST)) return send(res, 404, { error: 'App not built. Run `npm run build`.' });
  let file = normalize(join(DIST, decodeURIComponent(path)));
  if (!file.startsWith(DIST)) return send(res, 403, { error: 'Forbidden' });
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
  const ext = extname(file);
  res.writeHead(200, {
    'content-type': MIME[ext] ?? 'application/octet-stream',
    'cache-control': file.includes(`${DIST}/assets/`) ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  res.end(readFileSync(file));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('referrer-policy', 'no-referrer');
  res.setHeader('x-frame-options', 'DENY');
  res.setHeader('permissions-policy', 'geolocation=(), microphone=()');
  res.setHeader(
    'content-security-policy',
    // Google Identity Services + Fitness API are only used by the optional Google Fit step import.
    "default-src 'self'; script-src 'self' https://accounts.google.com/gsi/client; frame-src https://accounts.google.com; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; connect-src 'self' https://www.googleapis.com https://accounts.google.com" + (CORS_ORIGINS.length ? ` ${CORS_ORIGINS.join(' ')}` : '') + "; frame-ancestors 'none'",
  );
  const origin = req.headers.origin;
  if (origin && CORS_ORIGINS.includes(origin)) {
    res.setHeader('access-control-allow-origin', origin);
    res.setHeader('access-control-allow-headers', 'authorization, content-type');
    res.setHeader('access-control-allow-methods', 'GET, POST, DELETE');
    res.setHeader('vary', 'origin');
    if (req.method === 'OPTIONS') return res.writeHead(204).end();
  }
  try {
    if (url.pathname.startsWith('/api/')) await api(req, res, url.pathname);
    else serveStatic(res, url.pathname);
  } catch (e) {
    if (e instanceof HttpError || e instanceof AssistantError) return send(res, e.status, { error: e.message });
    console.error(e);
    send(res, 500, { error: 'Something went wrong' });
  }
});

server.listen(PORT, () => {
  console.log(`[october-arc] server on http://localhost:${PORT} (assistant ${assistantEnabled() ? 'enabled' : 'disabled'})`);
});
