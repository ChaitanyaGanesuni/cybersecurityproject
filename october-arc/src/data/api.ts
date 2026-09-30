// Client for the optional October Arc server (sync, account, cloud assistant).
// The app is fully functional without it.

export interface Session {
  serverUrl: string; // '' = same origin
  token: string;
  email: string;
}

const KEY = 'oa.session';

export function getSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

function setSession(s: Session | null) {
  if (s) localStorage.setItem(KEY, JSON.stringify(s));
  else localStorage.removeItem(KEY);
  window.dispatchEvent(new Event('oa-session'));
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T>(path: string, body?: unknown, opts: { method?: string; session?: Session | null; serverUrl?: string } = {}): Promise<T> {
  const session = opts.session === undefined ? getSession() : opts.session;
  const base = (opts.serverUrl ?? session?.serverUrl ?? '').replace(/\/$/, '');
  const res = await fetch(`${base}${path}`, {
    method: opts.method ?? (body === undefined ? 'GET' : 'POST'),
    headers: {
      'content-type': 'application/json',
      ...(session?.token ? { authorization: `Bearer ${session.token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && session) setSession(null);
    throw new ApiError(res.status, (data as { error?: string }).error ?? `Request failed (${res.status})`);
  }
  return data as T;
}

export async function signIn(serverUrl: string, email: string, password: string, create: boolean) {
  const r = await api<{ token: string }>(create ? '/api/auth/register' : '/api/auth/login', { email, password }, { session: null, serverUrl });
  setSession({ serverUrl, token: r.token, email });
}

export async function signOut() {
  try {
    await api('/api/auth/logout', {});
  } finally {
    setSession(null);
  }
}

export async function deleteAccount() {
  await api('/api/account', undefined, { method: 'DELETE' });
  setSession(null);
}

export async function serverInfo(serverUrl: string) {
  return api<{ ok: boolean; assistant: boolean }>('/api/health', undefined, { session: null, serverUrl });
}
