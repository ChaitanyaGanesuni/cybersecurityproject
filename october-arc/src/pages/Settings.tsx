import { useEffect, useState, type ReactNode } from 'react';
import { useApp } from '../data/store';
import {
  archiveHabit, deleteAllLocalData, deleteHabit, exportAll, restoreHabit, saveHabit, saveSettings,
} from '../data/repo';
import { deleteAccount, getSession, serverInfo, signIn, signOut } from '../data/api';
import { getSyncStatus, subscribeSync, syncNow, type SyncStatus } from '../data/sync';
import { HEALTH_PROVIDERS, type HealthStatus } from '../integrations/health';
import { disconnectGoogleFit, isConnected as fitConnected } from '../integrations/googleFit';
import { webChannel } from '../integrations/notify';
import { isNative } from '../native/platform';
import { nativeChannel, nativePermission } from '../native/notifications';
import { HealthConnect, autoImportHealth } from '../native/health';
import { FOOD_FLAGS, HABIT_SUGGESTIONS, PRIMARY_GOALS, CATEGORY_META } from '../domain/defaults';
import { SCORE_KEYS, type Habit, type Settings, type StreakPolicy } from '../domain/types';
import { Field, Sheet, num, toast, useRoute } from '../ui/kit';

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="card section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function SettingsPage() {
  const app = useApp();
  const route = useRoute();
  const s = app.settings;
  const set = (p: Partial<Settings>) => void saveSettings(p);
  const setGoal = (p: Partial<Settings['goals']>) => set({ goals: { ...s.goals, ...p } });
  const sub = route.path[1];

  useEffect(() => {
    if (sub) document.getElementById(sub)?.scrollIntoView({ block: 'start' });
  }, [sub]);

  return (
    <div className="fade-in">
      <div className="eyebrow" style={{ marginTop: 4 }}>Settings</div>
      <h1>Make it yours</h1>
      <nav className="chips" style={{ marginTop: 8 }}>
        {[['goals', 'Goals'], ['rules', 'Streak rules'], ['habits', 'Habits'], ['reminders', 'Reminders'], ['assistant', 'Assistant'], ['account', 'Sync'], ['privacy', 'Privacy'], ['arc', 'Arc']].map(([id, l]) => (
          <a key={id} className="chip" href={`#/settings/${id}`}>{l}</a>
        ))}
      </nav>

      <Section id="goals" title="🎯 Daily goals">
        <p className="tiny muted" style={{ marginTop: -4 }}>Changes apply from today. Finished days keep the result they had.</p>
        <Field label="Primary goal">
          <select value={s.primaryGoal} onChange={(e) => set({ primaryGoal: e.target.value as Settings['primaryGoal'] })}>
            {PRIMARY_GOALS.map((g) => <option key={g.id} value={g.id}>{g.emoji} {g.label}</option>)}
          </select>
        </Field>
        <div className="grid2" style={{ marginTop: 10 }}>
          <Field label="💧 Water (L/day)"><NumInput value={s.goals.waterMl / 1000} step={0.25} onCommit={(v) => setGoal({ waterMl: Math.round(v * 1000) })} /></Field>
          <Field label="🚶 Steps/day"><NumInput value={s.goals.steps} step={500} onCommit={(v) => setGoal({ steps: Math.round(v) })} /></Field>
          <Field label="😴 Sleep (hours)"><NumInput value={s.goals.sleepMin / 60} step={0.25} onCommit={(v) => setGoal({ sleepMin: Math.round(v * 60) })} /></Field>
          <Field label="🏃 Exercise (min/day)"><NumInput value={s.goals.exerciseMin} step={5} onCommit={(v) => setGoal({ exerciseMin: Math.round(v) })} /></Field>
          <Field label="🍽️ Calories (optional)"><NumInput value={s.goals.calories} step={50} optional onCommit={(v) => setGoal({ calories: v || null })} /></Field>
          <Field label="🥚 Protein g (optional)"><NumInput value={s.goals.proteinG} step={5} optional onCommit={(v) => setGoal({ proteinG: v || null })} /></Field>
        </div>
        {s.goals.calories != null && (
          <div style={{ marginTop: 10 }}>
            <Field label={`Calorie range: up to ${s.goals.calorieTolerancePct}% above target still counts`}>
              <input type="range" min={0} max={25} step={5} value={s.goals.calorieTolerancePct} onChange={(e) => setGoal({ calorieTolerancePct: Number(e.target.value) })} />
            </Field>
          </div>
        )}
        <div className="grid2" style={{ marginTop: 10 }}>
          <Field label="Usual wake-up"><input type="time" value={s.wakeTime} onChange={(e) => set({ wakeTime: e.target.value })} /></Field>
          <Field label="Usual bedtime"><input type="time" value={s.bedTime} onChange={(e) => set({ bedTime: e.target.value })} /></Field>
        </div>
        <p className="tiny muted">Wake/bed times pace your reminders through the day.</p>
        <h3 style={{ marginTop: 12 }}>Food quality to track</h3>
        <div className="chips">
          {FOOD_FLAGS.map((f) => {
            const on = s.trackedFoodFlags.includes(f.id);
            return (
              <button key={f.id} className={`chip${on ? ' on' : ''}`} onClick={() => set({ trackedFoodFlags: on ? s.trackedFoodFlags.filter((x) => x !== f.id) : [...s.trackedFoodFlags, f.id] })}>
                {f.emoji} {f.label}
              </button>
            );
          })}
        </div>
        <label className="row small" style={{ marginTop: 12 }}>
          <input type="checkbox" checked={s.showBodyTracking} onChange={(e) => set({ showBodyTracking: e.target.checked })} /> Show weight & body tracking
        </label>
      </Section>

      <Section id="rules" title="🔥 Score & streak rules">
        <p className="small sub" style={{ marginTop: -4 }}>
          A day counts toward your overall streak when every <b>“Breaks streak”</b> goal is complete <b>and</b> the day's score is at least the minimum below.
        </p>
        {SCORE_KEYS.map((k) => (
          <div key={k} className="list-item" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 6 }}>
            <div className="row between" style={{ width: '100%' }}>
              <b>{CATEGORY_META[k].emoji} {CATEGORY_META[k].label}</b>
              <select style={{ width: 'auto', minHeight: 36, padding: '4px 8px' }} value={s.policies[k]} onChange={(e) => set({ policies: { ...s.policies, [k]: e.target.value as StreakPolicy } })}>
                <option value="breaks">Breaks streak</option>
                <option value="score">Reduces score</option>
                <option value="none">No effect</option>
              </select>
            </div>
            {s.policies[k] !== 'none' && (
              <div className="row" style={{ width: '100%' }}>
                <span className="tiny muted" style={{ width: 70 }}>Weight {s.weights[k]}</span>
                <input type="range" min={0} max={50} step={5} value={s.weights[k]} onChange={(e) => set({ weights: { ...s.weights, [k]: Number(e.target.value) } })} />
              </div>
            )}
          </div>
        ))}
        <p className="tiny muted">Weights are relative — they're normalised to 100% across active goals.</p>
        <Field label={`Minimum day score for the streak: ${s.minDayScore}%`}>
          <input type="range" min={0} max={100} step={5} value={s.minDayScore} onChange={(e) => set({ minDayScore: Number(e.target.value) })} />
        </Field>
        <div style={{ marginTop: 10 }}>
          <Field label="Streak protections per arc" hint={app.arc ? `Current arc: ${app.protectionsLeft} of ${app.arc.protectionsTotal} left. This setting applies to new arcs.` : undefined}>
            <input type="number" min={0} max={10} value={s.protectionsPerArc} onChange={(e) => set({ protectionsPerArc: Math.max(0, Math.min(10, Number(e.target.value))) })} />
          </Field>
        </div>
      </Section>

      <HabitsManager />
      <RemindersSection />

      <Section id="health" title="📱 Health data">
        <HealthStatusList />
      </Section>

      <Section id="assistant" title="✨ Assistant">
        <p className="small sub" style={{ marginTop: -4 }}>The on-device assistant always works offline. The optional cloud assistant uses Claude through your own October Arc server and needs an account (below).</p>
        <label className="row small">
          <input type="checkbox" checked={s.assistant.cloudEnabled} disabled={!getSession()} onChange={(e) => set({ assistant: { cloudEnabled: e.target.checked } })} />
          Use cloud assistant{!getSession() ? ' (sign in first)' : ''}
        </label>
        <p className="tiny muted">When on, each question sends: your goals, streak counts, today's totals and meal names, and a summary of up to 14 recent days. No photos, notes, journal entries or body measurements.</p>
      </Section>

      <AccountSection />

      <Section id="privacy" title="🔒 Privacy & data">
        <ul className="small sub" style={{ paddingLeft: 18, marginTop: 0 }}>
          <li>Your data lives on this device first. No account is required.</li>
          <li>Sync and the cloud assistant are off unless you turn them on.</li>
          <li>Synced records are encrypted at rest on the server. Meal photos never leave this device.</li>
          <li>No analytics, ads or third-party trackers. Your data is never sold.</li>
        </ul>
        <div className="grid2">
          <button
            className="btn"
            onClick={async () => {
              const data = await exportAll();
              const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = `october-arc-export-${app.today}.json`;
              a.click();
            }}
          >
            ⬇️ Export my data
          </button>
          <button
            className="btn danger"
            onClick={() => {
              if (prompt('This permanently deletes all October Arc data on this device. Type DELETE to confirm.') === 'DELETE') void deleteAllLocalData();
            }}
          >
            Delete device data
          </button>
        </div>
      </Section>

      <Section id="arc" title="🗓️ Arc">
        {app.arc ? (
          <p className="small sub" style={{ marginTop: -4 }}>{app.arc.name}: {app.arc.startDate} → {app.arc.endDate}</p>
        ) : (
          <p className="small sub">No active arc.</p>
        )}
        <a className="btn block" href="#/new-arc">Start a new arc</a>
      </Section>
    </div>
  );
}

function NumInput({ value, step, onCommit, optional }: { value: number | null; step: number; onCommit: (v: number) => void; optional?: boolean }) {
  const [v, setV] = useState(value == null ? '' : String(+value.toFixed(2)));
  useEffect(() => setV(value == null ? '' : String(+value.toFixed(2))), [value]);
  return (
    <input
      type="number"
      inputMode="decimal"
      step={step}
      value={v}
      placeholder={optional ? 'Not tracked' : undefined}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        const n = num(v);
        if (n == null && optional) onCommit(0);
        else if (n != null && n >= 0) onCommit(n);
      }}
    />
  );
}

function HabitsManager() {
  const app = useApp();
  const [edit, setEdit] = useState<Partial<Habit> | null>(null);
  const archived = app.habits.filter((h) => !h.active);
  return (
    <Section id="habits" title="✅ Habits">
      {app.activeHabits.map((h) => (
        <div key={h.id} className="list-item">
          <span style={{ fontSize: 20 }}>{h.emoji}</span>
          <div className="grow">
            <b>{h.name}</b>
            <div className="tiny muted">{h.unit ? `${h.target} ${h.unit}/day` : 'Yes / no'}{h.reminderTime ? ` · ⏰ ${h.reminderTime}` : ''}</div>
          </div>
          <button className="btn sm" onClick={() => setEdit(h)}>Edit</button>
        </div>
      ))}
      {app.activeHabits.length === 0 && <p className="small sub">No habits yet. Add one from the suggestions or create your own.</p>}
      <div className="chips" style={{ marginTop: 10 }}>
        {HABIT_SUGGESTIONS.filter((x) => !app.activeHabits.some((h) => h.name === x.name)).map((x) => (
          <button key={x.name} className="chip" onClick={() => setEdit({ ...x, reminderTime: null, active: true })}>+ {x.emoji} {x.name}</button>
        ))}
        <button className="chip on" onClick={() => setEdit({ name: '', emoji: '⭐', target: 1, unit: '', reminderTime: null, active: true })}>+ Custom habit</button>
      </div>
      {archived.length > 0 && (
        <>
          <h3 style={{ marginTop: 14 }}>Archived (history kept)</h3>
          {archived.map((h) => (
            <div key={h.id} className="list-item small">
              <span>{h.emoji}</span>
              <div className="grow muted">{h.name}</div>
              <button className="btn sm" onClick={() => void restoreHabit(h)}>Restore</button>
              <button className="btn sm danger" onClick={() => confirm(`Permanently delete "${h.name}" and its history?`) && void deleteHabit(h)}>Delete</button>
            </div>
          ))}
        </>
      )}
      {edit && <HabitEditor habit={edit} onClose={() => setEdit(null)} />}
    </Section>
  );
}

function HabitEditor({ habit, onClose }: { habit: Partial<Habit>; onClose: () => void }) {
  const app = useApp();
  const [name, setName] = useState(habit.name ?? '');
  const [emoji, setEmoji] = useState(habit.emoji ?? '⭐');
  const [counted, setCounted] = useState(!!habit.unit);
  const [target, setTarget] = useState(String(habit.target ?? 1));
  const [unit, setUnit] = useState(habit.unit ?? '');
  const [reminder, setReminder] = useState(habit.reminderTime ?? '');
  async function save() {
    if (!name.trim()) return toast('Give the habit a name');
    await saveHabit(
      { ...habit, name: name.trim(), emoji: emoji || '⭐', target: counted ? Math.max(1, num(target) ?? 1) : 1, unit: counted ? unit.trim() || 'times' : '', reminderTime: reminder || null, active: true },
      app.today,
    );
    toast('Habit saved');
    onClose();
  }
  return (
    <Sheet open onClose={onClose} title={habit.id ? 'Edit habit' : 'New habit'}>
      <div className="grid2" style={{ gridTemplateColumns: '80px 1fr' }}>
        <Field label="Emoji"><input type="text" value={emoji} maxLength={4} onChange={(e) => setEmoji(e.target.value)} /></Field>
        <Field label="Name"><input type="text" value={name} onChange={(e) => setName(e.target.value)} /></Field>
      </div>
      <label className="row small" style={{ marginTop: 10 }}>
        <input type="checkbox" checked={counted} onChange={(e) => setCounted(e.target.checked)} /> Has a daily amount (e.g. 10 pages, 10 min)
      </label>
      {counted && (
        <div className="grid2" style={{ marginTop: 10 }}>
          <Field label="Daily target"><input type="number" value={target} onChange={(e) => setTarget(e.target.value)} /></Field>
          <Field label="Unit"><input type="text" placeholder="min, pages…" value={unit} onChange={(e) => setUnit(e.target.value)} /></Field>
        </div>
      )}
      <div style={{ marginTop: 10 }}><Field label="Reminder time (optional)"><input type="time" value={reminder} onChange={(e) => setReminder(e.target.value)} /></Field></div>
      <div className="row" style={{ marginTop: 14 }}>
        {habit.id && <button className="btn ghost" onClick={() => void archiveHabit(habit as Habit, app.today).then(onClose)}>Archive</button>}
        <button className="btn primary grow" onClick={() => void save()}>Save</button>
      </div>
    </Sheet>
  );
}

function RemindersSection() {
  const { settings: s } = useApp();
  const r = s.reminders;
  const setR = (p: Partial<Settings['reminders']>) => void saveSettings({ reminders: { ...r, ...p } });
  const channel = isNative ? nativeChannel : webChannel;
  const [perm, setPerm] = useState<NotificationPermission | 'unsupported'>(isNative ? 'default' : webChannel.permission());
  const refreshPerm = async () => setPerm(isNative ? await nativePermission() : webChannel.permission());
  useEffect(() => void refreshPerm(), []);
  const slots: [keyof Settings['reminders'], string][] = [['morning', '☀️ Morning'], ['afternoon', '💧 Afternoon'], ['evening', '🔥 Evening'], ['night', '🌙 Night check-in']];
  return (
    <Section id="reminders" title="🔔 Reminders">
      <label className="row small">
        <input
          type="checkbox"
          checked={r.enabled}
          onChange={async (e) => {
            if (e.target.checked && perm !== 'granted') {
              const ok = await channel.requestPermission();
              await refreshPerm();
              if (!ok) toast('Notifications blocked — in-app nudges still work.');
            }
            setR({ enabled: e.target.checked });
          }}
        />
        Enable reminders {perm === 'denied' ? (isNative ? '(blocked — allow notifications for October Arc in Android settings)' : '(blocked in browser settings)') : perm === 'unsupported' ? '(not supported here)' : ''}
      </label>
      <p className="tiny muted">Reminders only fire when there's something useful to say, at most {r.maxPerDay} a day, never during quiet hours.{isNative
          ? ' They are scheduled on your phone, so they arrive even when the app is closed.'
          : " In the web app they're delivered while the app is open or recently used; the Android app schedules them in the background."}</p>
      {r.enabled && (
        <>
          {slots.map(([k, l]) => (
            <div key={k} className="row between" style={{ marginTop: 8 }}>
              <label className="row small grow">
                <input type="checkbox" checked={r[k] != null} onChange={(e) => setR({ [k]: e.target.checked ? '12:00' : null })} /> {l}
              </label>
              {r[k] != null && <input type="time" style={{ width: 130 }} value={r[k] as string} onChange={(e) => setR({ [k]: e.target.value })} />}
            </div>
          ))}
          <div className="row between" style={{ marginTop: 12 }}>
            <span className="small">💧 Water reminders</span>
            <select
              style={{ width: 'auto', minHeight: 36, padding: '4px 8px' }}
              value={r.waterEveryMin ?? 0}
              onChange={(e) => setR({ waterEveryMin: Number(e.target.value) || null })}
            >
              <option value={0}>Off</option>
              <option value={60}>Every hour</option>
              <option value={90}>Every 1.5 hours</option>
              <option value={120}>Every 2 hours</option>
              <option value={180}>Every 3 hours</option>
            </select>
          </div>
          <p className="tiny muted" style={{ margin: '4px 0 0' }}>
            Only while your water goal is open, between your wake-up time and 30 min before bed. Logging water resets the timer. Tap “+250 ml” on the notification to log it{isNative ? '.' : ' without opening the app (Chrome on Android and desktop).'}
          </p>
          <label className="row small" style={{ marginTop: 10 }}>
            <input type="checkbox" checked={r.habitReminders} onChange={(e) => setR({ habitReminders: e.target.checked })} /> Habit reminders at each habit's time
          </label>
          <div className="grid3" style={{ marginTop: 10 }}>
            <Field label="Max/day"><input type="number" min={1} max={8} value={r.maxPerDay} onChange={(e) => setR({ maxPerDay: Math.max(1, Math.min(8, Number(e.target.value))) })} /></Field>
            <Field label="Quiet from"><input type="time" value={r.quietStart} onChange={(e) => setR({ quietStart: e.target.value })} /></Field>
            <Field label="Quiet until"><input type="time" value={r.quietEnd} onChange={(e) => setR({ quietEnd: e.target.value })} /></Field>
          </div>
          <button className="btn ghost sm" style={{ marginTop: 10 }} onClick={() => void channel.show({ type: 'test', title: '🔔 October Arc', body: 'Reminders are working.' }).then((ok) => !ok && toast('Permission needed'))}>
            Send test notification
          </button>
        </>
      )}
    </Section>
  );
}

function HealthStatusList() {
  const [st, setSt] = useState<Record<string, HealthStatus>>({});
  const [fit, setFit] = useState(fitConnected());
  useEffect(() => {
    void Promise.all(HEALTH_PROVIDERS.map(async (p) => [p.id, await p.status()] as const)).then((xs) => setSt(Object.fromEntries(xs)));
  }, []);
  return (
    <>
      {HEALTH_PROVIDERS.map((p) => (
        <div key={p.id} className="list-item" style={{ alignItems: 'flex-start' }}>
          <div className="grow">
            <b>{p.name}</b> <span className="tiny" style={{ color: st[p.id] === 'available' ? 'var(--good)' : 'var(--muted)' }}>{st[p.id] === 'available' ? '● Available' : '○ Not available'}</span>
            <div className="tiny muted">{p.requirement}</div>
            {p.id === 'health-connect' && st[p.id] === 'available' && (
              <div className="row wrap" style={{ marginTop: 8, gap: 8 }}>
                <button
                  className="btn sm"
                  onClick={async () => {
                    try {
                      if (await p.requestAccess()) {
                        await autoImportHealth();
                        toast('Health Connect connected — steps and sleep import automatically');
                      } else toast('Permission not granted');
                    } catch (e) {
                      toast((e as Error).message);
                    }
                  }}
                >
                  Connect Health Connect
                </button>
                <button className="btn ghost sm" onClick={() => void HealthConnect.openHealthConnect()}>Manage permissions</button>
              </div>
            )}
            {p.id === 'health-connect' && isNative && st[p.id] !== 'available' && (
              <button className="btn sm" style={{ marginTop: 8 }} onClick={() => void HealthConnect.openHealthConnect()}>Install / update Health Connect</button>
            )}
            {p.id === 'google-fit' && st[p.id] === 'available' && (
              <button
                className="btn sm"
                style={{ marginTop: 8 }}
                onClick={async () => {
                  if (fit) {
                    disconnectGoogleFit();
                    setFit(false);
                    return toast('Google Fit disconnected');
                  }
                  try {
                    await p.requestAccess();
                    setFit(true);
                    toast('Google Fit connected — use “Sync from Google Fit” on the Steps card');
                  } catch (e) {
                    toast((e as Error).message);
                  }
                }}
              >
                {fit ? 'Disconnect Google Fit' : 'Connect Google Fit'}
              </button>
            )}
          </div>
        </div>
      ))}
      <p className="tiny muted" style={{ marginBottom: 0 }}>
        {isNative
          ? 'Health Connect access is read-only (steps and sleep) and stays on this phone. Google Fit, Samsung Health and most watches share their data through Health Connect. Manual entry always works.'
          : 'Google Fit only reads your step count (read-only access). The Google token stays in this browser and is never sent to the October Arc server. Manual step entry always works.'}
      </p>
    </>
  );
}

export function AccountSection() {
  const [session, setSession] = useState(getSession());
  const [sync, setSync] = useState<SyncStatus>(getSyncStatus());
  const [server, setServer] = useState(session?.serverUrl ?? '');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const on = () => setSession(getSession());
    window.addEventListener('oa-session', on);
    const unsub = subscribeSync(setSync);
    return () => { window.removeEventListener('oa-session', on); unsub(); };
  }, []);

  async function go(create: boolean) {
    setBusy(true);
    try {
      await serverInfo(server);
      // Don't write settings here: on a new device that would stamp default
      // settings as "newest" and overwrite the synced ones.
      await signIn(server, email.trim(), pw, create);
      setPw('');
      toast(create ? 'Account created — syncing' : 'Signed in — syncing');
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section id="account" title="☁️ Account & sync">
      {session ? (
        <>
          <p className="small" style={{ marginTop: -4 }}>Signed in as <b>{session.email}</b>{session.serverUrl ? ` on ${session.serverUrl}` : ''}.</p>
          <p className="small sub">
            Sync: {sync.state}{sync.pending ? ` · ${sync.pending} change(s) waiting` : ''}{sync.lastSyncAt ? ` · last ${new Date(sync.lastSyncAt).toLocaleTimeString()}` : ''}{sync.error ? ` · ${sync.error}` : ''}
          </p>
          <div className="grid2">
            <button className="btn" onClick={() => void syncNow()}>⟳ Sync now</button>
            <button className="btn ghost" onClick={() => void signOut()}>Sign out</button>
          </div>
          <button
            className="btn danger block"
            style={{ marginTop: 10 }}
            onClick={() => confirm('Delete your account and all synced data from the server? Data on this device is kept.') && void deleteAccount().then(() => toast('Server account deleted'))}
          >
            Delete server account & data
          </button>
        </>
      ) : (
        <>
          <p className="small sub" style={{ marginTop: -4 }}>Optional. Back up and sync across devices through your own October Arc server. Everything works offline without it.</p>
          <Field label="Server URL" hint={isNative ? 'The https:// address of your October Arc server.' : 'Leave blank if this app is served by the October Arc server itself.'}><input type="url" placeholder="https://arc.example.com" value={server} onChange={(e) => setServer(e.target.value)} /></Field>
          <div className="grid2" style={{ marginTop: 10 }}>
            <Field label="Email"><input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            <Field label="Password (10+ chars)"><input type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
          </div>
          <div className="grid2" style={{ marginTop: 12 }}>
            <button className="btn primary" disabled={busy || !email || pw.length < 10 || (isNative && !server)} onClick={() => void go(false)}>Sign in</button>
            <button className="btn" disabled={busy || !email || pw.length < 10 || (isNative && !server)} onClick={() => void go(true)}>Create account</button>
          </div>
        </>
      )}
    </Section>
  );
}
