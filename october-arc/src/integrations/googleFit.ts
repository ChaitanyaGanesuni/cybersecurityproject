// Google Fit step import (web, via the Fitness REST API).
//
// Requirements — read before relying on this:
//  - A Google Cloud OAuth "Web application" client ID whose project has the
//    Fitness API enabled, set at build time as VITE_GOOGLE_FIT_CLIENT_ID.
//    Add this app's origin to the client's "Authorized JavaScript origins".
//  - Google closed Fit API sign-ups for new developers on May 1, 2024, so this
//    only works with a project that already had access.
//  - Google has announced the Fit APIs end in 2026; Health Connect (native
//    Android) is the long-term replacement. When Google turns the API off,
//    calls fail and the app falls back to manual entry — nothing is invented.
//  - fitness.* scopes are "sensitive": an unverified OAuth app works for the
//    test users listed on its consent screen, which is fine for personal use.
//
// Auth uses Google Identity Services' token model: the access token stays in
// memory only (never stored, never sent to the October Arc server).

import type { HealthProvider, HealthStatus } from './health';

const CLIENT_ID: string | undefined = import.meta.env.VITE_GOOGLE_FIT_CLIENT_ID;
const SCOPE = 'https://www.googleapis.com/auth/fitness.activity.read';
const GIS_SRC = 'https://accounts.google.com/gsi/client';
const AGGREGATE_URL = 'https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate';
/** The data source the Google Fit app itself uses for its step count. */
export const ESTIMATED_STEPS = 'derived:com.google.step_count.delta:com.google.android.gms:estimated_steps';

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}
interface TokenClient {
  requestAccessToken(opts?: { prompt?: string }): void;
  callback: (r: TokenResponse) => void;
}
declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(cfg: {
            client_id: string;
            scope: string;
            callback: (r: TokenResponse) => void;
            error_callback?: (e: { type: string; message?: string }) => void;
          }): TokenClient;
          revoke(token: string, done?: () => void): void;
        };
      };
    };
  }
}

let token: { value: string; expiresAt: number } | null = null;
let client: TokenClient | null = null;
let pending: { resolve: (t: string) => void; reject: (e: Error) => void } | null = null;
const CONNECTED_KEY = 'oa.googleFit.connected';

function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = GIS_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Couldn't load Google sign-in (are you offline?)"));
    document.head.appendChild(s);
  });
}

async function getToken(interactive: boolean): Promise<string> {
  if (token && token.expiresAt - 60_000 > Date.now()) return token.value;
  if (!CLIENT_ID) throw new Error('Google Fit is not configured (VITE_GOOGLE_FIT_CLIENT_ID).');
  await loadGis();
  client ??= window.google!.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPE,
    callback: (r) => {
      const p = pending;
      pending = null;
      if (!p) return;
      if (r.error || !r.access_token) {
        p.reject(new Error(r.error_description || r.error || 'Google Fit access was not granted'));
        return;
      }
      token = { value: r.access_token, expiresAt: Date.now() + (r.expires_in ?? 3600) * 1000 };
      localStorage.setItem(CONNECTED_KEY, '1');
      p.resolve(r.access_token);
    },
    error_callback: (e) => {
      const p = pending;
      pending = null;
      p?.reject(new Error(e.type === 'popup_closed' ? 'Google sign-in was closed' : e.message || 'Google sign-in failed'));
    },
  });
  return new Promise((resolve, reject) => {
    pending = { resolve, reject };
    // After the first consent, prompt '' re-issues a token without asking again.
    client!.requestAccessToken({ prompt: interactive && !isConnected() ? 'consent' : '' });
  });
}

export const isConnected = () => localStorage.getItem(CONNECTED_KEY) === '1';

/** Request body for one local calendar day, bucketed as a single day. */
export function stepsRequest(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  const start = new Date(y, m - 1, d).getTime();
  const end = new Date(y, m - 1, d + 1).getTime(); // DST-safe local midnight
  return {
    aggregateBy: [{ dataSourceId: ESTIMATED_STEPS }],
    bucketByTime: { durationMillis: end - start },
    startTimeMillis: start,
    endTimeMillis: end,
  };
}

interface AggregateResponse {
  bucket?: { dataset?: { point?: { value?: { intVal?: number }[] }[] }[] }[];
}

/** Sum step points; null when Fit has no data at all for the day. */
export function parseSteps(res: AggregateResponse): number | null {
  let total = 0;
  let any = false;
  for (const b of res.bucket ?? [])
    for (const ds of b.dataset ?? [])
      for (const p of ds.point ?? [])
        for (const v of p.value ?? [])
          if (typeof v.intVal === 'number') {
            total += v.intVal;
            any = true;
          }
  return any ? total : null;
}

export async function fetchSteps(date: string, accessToken: string, f: typeof fetch = fetch): Promise<number | null> {
  const res = await f(AGGREGATE_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify(stepsRequest(date)),
  });
  if (res.status === 401) {
    token = null;
    throw new Error('Google Fit session expired — tap sync again');
  }
  if (res.status === 403 || res.status === 404 || res.status === 410) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(`Google Fit refused the request: ${body.error?.message ?? res.statusText}. The Fit API may not be enabled for this project, or it may have been retired.`);
  }
  if (!res.ok) throw new Error(`Google Fit error (${res.status})`);
  return parseSteps((await res.json()) as AggregateResponse);
}

export function disconnectGoogleFit() {
  if (token && window.google) window.google.accounts.oauth2.revoke(token.value);
  token = null;
  localStorage.removeItem(CONNECTED_KEY);
}

export const googleFitProvider: HealthProvider = {
  id: 'google-fit',
  name: 'Google Fit',
  requirement:
    'Needs a Google OAuth client ID (VITE_GOOGLE_FIT_CLIENT_ID) from a project with the Fitness API enabled. Google closed new Fit API sign-ups in May 2024 and plans to end the API in 2026.',
  async status(): Promise<HealthStatus> {
    return CLIENT_ID ? 'available' : 'unavailable';
  },
  async requestAccess() {
    await getToken(true);
    return true;
  },
  async readSteps(date) {
    return fetchSteps(date, await getToken(true));
  },
};
