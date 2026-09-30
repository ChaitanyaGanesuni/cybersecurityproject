import { useEffect, useState } from 'react';
import { useApp } from '../data/store';
import {
  addWater, clearSleep, deleteWorkout, saveWorkout, setHabitValue, setSleep, setSteps, undoLastWater,
} from '../data/repo';
import { availableHealthProvider, type HealthProvider } from '../integrations/health';
import { emptyRawDay, evaluateDay } from '../domain/scoring';
import { addDays, minutesOfDay, minutesToHM, sleepMinutes } from '../domain/dates';
import { fmtDateLong, fmtDuration, fmtInt, fmtLiters } from '../domain/format';
import { WORKOUT_TYPES } from '../domain/defaults';
import { walkMinutes } from '../domain/nudges';
import type { WorkoutType } from '../domain/types';
import { Bar, Field, Sheet, WaterGlass, go, num, toast, useRoute } from '../ui/kit';
import { COLOR } from '../ui/goals';
import { BarChart } from '../ui/charts';

export function Today() {
  const app = useApp();
  const route = useRoute();
  const date = route.query.get('date') ?? app.today;
  const isToday = date === app.today;
  const s = app.settings;
  const raw = app.raw.get(date) ?? emptyRawDay(date);
  const e = isToday ? app.todayEval : app.evals.get(date) ?? evaluateDay(raw, s, app.habits);
  const t = e.totals;
  const section = route.path[1];

  useEffect(() => {
    if (section) document.getElementById(section)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [section]);

  // One-tap actions from nudges, e.g. #/today/water?add=500
  const add = route.query.get('add');
  useEffect(() => {
    if (add && section === 'water') {
      void addWater(date, Number(add)).then(() => toast(`💧 +${add} ml`));
      go(`#/today/water${isToday ? '' : `?date=${date}`}`);
    }
  }, [add, section, date, isToday]);

  return (
    <div className="fade-in">
      <div className="eyebrow" style={{ marginTop: 4 }}>{isToday ? 'Today' : 'Editing a past day'}</div>
      <h1>{fmtDateLong(date)}</h1>
      <div className="row small" style={{ marginTop: 6 }}>
        <a className="chip" href={`#/today?date=${addDays(date, -1)}`}>‹ Prev day</a>
        {!isToday && <a className="chip" href="#/today">Back to today</a>}
        {date < app.today && <a className="chip" href={`#/today?date=${addDays(date, 1)}`}>Next day ›</a>}
      </div>

      <WaterSection date={date} ml={t.waterMl} />
      <StepsSection date={date} steps={t.steps} />
      <SleepSection date={date} />
      <ExerciseSection date={date} minutes={t.exerciseMin} />
      <HabitsSection date={date} />
    </div>
  );
}

function WaterSection({ date, ml }: { date: string; ml: number }) {
  const { settings: s } = useApp();
  const goal = s.goals.waterMl;
  const [custom, setCustom] = useState('');
  return (
    <section id="water" className="card section">
      <div className="row between"><h2>💧 Water</h2><span className="small sub">{fmtLiters(ml)} / {fmtLiters(goal)}</span></div>
      <div className="row" style={{ gap: 18 }}>
        <WaterGlass value={ml / goal} />
        <div className="grow">
          <div className="big-num" style={{ color: 'var(--water)' }}>{fmtLiters(ml)}</div>
          <div className="sub small">{ml >= goal ? '🎉 Daily hydration goal completed!' : `${fmtLiters(goal - ml)} to go`}</div>
          <button className="btn ghost sm" style={{ marginTop: 10 }} onClick={() => void undoLastWater(date).then(() => toast('Removed last entry'))} disabled={ml === 0}>
            ↶ Undo last
          </button>
        </div>
      </div>
      <div className="quick-grid" style={{ marginTop: 14 }}>
        {[250, 500, 750, 1000].map((v) => (
          <button key={v} className="btn" onClick={() => void addWater(date, v).then(() => toast(`💧 +${v >= 1000 ? '1 L' : `${v} ml`}`))}>
            +{v >= 1000 ? '1 L' : `${v} ml`}
          </button>
        ))}
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <input type="number" inputMode="numeric" placeholder="Custom ml" value={custom} onChange={(e) => setCustom(e.target.value)} />
        <button className="btn sm" disabled={!num(custom)} onClick={() => { void addWater(date, num(custom)!); setCustom(''); }}>Add</button>
      </div>
    </section>
  );
}

const MILESTONES = [0.25, 0.5, 0.75, 1];

function StepsSection({ date, steps }: { date: string; steps: number }) {
  const app = useApp();
  const s = app.settings;
  const goal = s.goals.steps;
  const [val, setVal] = useState('');
  const [provider, setProvider] = useState<HealthProvider | null>(null);
  const synced = steps > 0 && app.raw.get(date)?.steps?.source !== 'manual' ? app.raw.get(date)?.steps?.source : null;
  useEffect(() => { void availableHealthProvider().then(setProvider); }, []);
  const remaining = Math.max(0, goal - steps);

  async function save(n: number, source = 'manual') {
    const before = steps / goal, after = n / goal;
    await setSteps(date, n, source);
    const hit = MILESTONES.filter((m) => before < m && after >= m).pop();
    if (hit && hit < 1) {
      const left = Math.max(0, goal - n);
      toast(`🚶 ${hit * 100}% of your step goal! You're only ${fmtInt(left)} steps away.`);
    }
    setVal('');
  }

  return (
    <section id="steps" className="card section">
      <div className="row between"><h2>🚶 Steps</h2><span className="small sub">{fmtInt(steps)} / {fmtInt(goal)}</span></div>
      <div className="big-num" style={{ color: 'var(--steps)' }}>{fmtInt(steps)}</div>
      <div style={{ margin: '10px 0 6px' }}><Bar value={steps / goal} color={COLOR.steps} thick /></div>
      <div className="small sub">
        {remaining === 0 ? '🎉 Step goal complete!' : `${fmtInt(remaining)} steps remaining — about a ${walkMinutes(remaining).join('–')} minute walk.`}
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <input type="number" inputMode="numeric" placeholder="Today's total steps" value={val} onChange={(e) => setVal(e.target.value)} />
        <button className="btn primary sm" disabled={num(val) == null} onClick={() => void save(num(val)!)}>Save</button>
      </div>
      <div className="chips" style={{ marginTop: 8 }}>
        {[500, 1000, 2000].map((v) => (
          <button key={v} className="chip" onClick={() => void save(steps + v)}>+{fmtInt(v)}</button>
        ))}
      </div>
      {provider && (
        <button
          className="btn ghost block"
          style={{ marginTop: 10 }}
          onClick={async () => {
            try {
              if (!(await provider.requestAccess())) return toast('Permission not granted');
              const n = await provider.readSteps(date);
              if (n == null) return toast(`${provider.name} has no steps for this day yet`);
              await save(n, provider.id);
              toast(`⟳ ${fmtInt(n)} steps from ${provider.name}`);
            } catch (e) {
              toast((e as Error).message);
            }
          }}
        >
          ⟳ Sync from {provider.name}
        </button>
      )}
      {synced && <p className="tiny muted" style={{ marginBottom: 0 }}>Last value imported from {synced === 'google-fit' ? 'Google Fit' : synced === 'health-connect' ? 'Health Connect (updates automatically)' : synced}. Saving a number above replaces it.</p>}
      {!provider && <p className="tiny muted" style={{ marginBottom: 0 }}>Automatic step import isn't set up (Google Fit, Health Connect or Apple Health — see Settings → Health data). Enter your total from your phone or watch.</p>}
    </section>
  );
}

function SleepSection({ date }: { date: string }) {
  const app = useApp();
  const s = app.settings;
  const entry = app.raw.get(date)?.sleep;
  const [bed, setBed] = useState(entry?.bedtime ?? s.bedTime);
  const [wake, setWake] = useState(entry?.wakeTime ?? s.wakeTime);
  const [quality, setQuality] = useState<number | undefined>(entry?.quality);
  useEffect(() => {
    setBed(entry?.bedtime ?? s.bedTime);
    setWake(entry?.wakeTime ?? s.wakeTime);
    setQuality(entry?.quality);
  }, [entry?.bedtime, entry?.wakeTime, entry?.quality, s.bedTime, s.wakeTime]);
  const mins = sleepMinutes(bed, wake);
  const vsTarget = entry ? entry.minutes / s.goals.sleepMin : 0;
  const label = !entry ? null : vsTarget >= 1 ? 'On target' : vsTarget >= 0.9 ? 'Close to target' : 'Below target';
  const week = Array.from({ length: 7 }, (_, i) => addDays(date, i - 6));

  return (
    <section id="sleep" className="card section">
      <div className="row between"><h2>😴 Sleep</h2><span className="small sub">Target {fmtDuration(s.goals.sleepMin)}</span></div>
      {entry ? (
        <div className="row between">
          <div>
            <div className="big-num" style={{ color: 'var(--sleep)' }}>{fmtDuration(entry.minutes)}</div>
            <div className="small sub">{label}{entry.quality ? ` · felt ${['', 'poor', 'fair', 'okay', 'good', 'great'][entry.quality]}` : ''}</div>
          </div>
          <button className="btn ghost sm" onClick={() => void clearSleep(date)}>Clear</button>
        </div>
      ) : (
        <p className="sub small" style={{ marginTop: 0 }}>Log the night that ended this morning.</p>
      )}
      <div className="grid2" style={{ marginTop: 12 }}>
        <Field label="Bedtime"><input type="time" value={bed} onChange={(e) => setBed(e.target.value)} /></Field>
        <Field label="Wake-up"><input type="time" value={wake} onChange={(e) => setWake(e.target.value)} /></Field>
      </div>
      <div className="small sub" style={{ margin: '8px 0' }}>That's {fmtDuration(mins)}. How did it feel? (optional)</div>
      <div className="chips">
        {['😫', '😕', '😐', '🙂', '😄'].map((f, i) => (
          <button key={f} className={`chip${quality === i + 1 ? ' on' : ''}`} onClick={() => setQuality(quality === i + 1 ? undefined : i + 1)}>{f}</button>
        ))}
      </div>
      <button className="btn primary block" style={{ marginTop: 12 }} onClick={() => void setSleep(date, bed, wake, quality as 1).then(() => toast('😴 Sleep saved'))}>
        {entry ? 'Update sleep' : 'Save sleep'}
      </button>
      <h3 style={{ marginTop: 16 }}>Last 7 nights</h3>
      <BarChart
        color="var(--sleep)"
        goal={s.goals.sleepMin / 60}
        goalLabel="target"
        data={week.map((d) => {
          const m = app.raw.get(d)?.sleep?.minutes;
          return { label: d.slice(8), value: m != null ? m / 60 : null, tip: m != null ? `${d.slice(5)}: ${fmtDuration(m)}` : `${d.slice(5)}: not logged` };
        })}
      />
      <p className="tiny muted" style={{ marginBottom: 0 }}>Sleep insights are about your own logged times, not a medical assessment.</p>
    </section>
  );
}

function ExerciseSection({ date, minutes }: { date: string; minutes: number }) {
  const app = useApp();
  const goal = app.settings.goals.exerciseMin;
  const list = app.raw.get(date)?.workouts ?? [];
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<WorkoutType>('walking');
  const [dur, setDur] = useState('30');
  const [dist, setDist] = useState('');
  const [cal, setCal] = useState('');
  const [notes, setNotes] = useState('');
  const [start, setStart] = useState(() => minutesToHM(Math.max(0, minutesOfDay(new Date()) - 30)));

  async function save() {
    const d = num(dur);
    if (!d || d <= 0) return toast('Add a duration');
    await saveWorkout({ date, type, durationMin: d, distanceKm: num(dist), caloriesBurned: num(cal), notes: notes || undefined, startTime: start });
    setOpen(false);
    setDist(''); setCal(''); setNotes('');
    toast('🏃 Workout logged');
  }

  return (
    <section id="exercise" className="card section">
      <div className="row between"><h2>🏃 Exercise</h2><span className="small sub">{minutes} / {goal} min</span></div>
      <Bar value={minutes / goal} color={COLOR.exercise} thick />
      <div className="small sub" style={{ marginTop: 6 }}>{minutes >= goal ? '✓ Workout completed' : minutes ? `${goal - minutes} more minutes to go` : 'Even 15 minutes moves today forward.'}</div>
      {list.map((w) => {
        const meta = WORKOUT_TYPES.find((x) => x.id === w.type)!;
        return (
          <div key={w.id} className="list-item">
            <span style={{ fontSize: 22 }}>{meta.emoji}</span>
            <div className="grow">
              <b>{meta.label}</b>
              <div className="small sub">
                {w.durationMin} min{w.distanceKm ? ` · ${w.distanceKm} km` : ''}{w.caloriesBurned ? ` · ${w.caloriesBurned} kcal` : ''} · {w.startTime}
              </div>
              {w.notes && <div className="tiny muted">{w.notes}</div>}
            </div>
            <button className="icon-btn" aria-label="Delete workout" onClick={() => void deleteWorkout(w.id)}>🗑</button>
          </div>
        );
      })}
      <button className="btn primary block" style={{ marginTop: 12 }} onClick={() => setOpen(true)}>+ Log workout</button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Log workout">
        <div className="chips">
          {WORKOUT_TYPES.map((w) => (
            <button key={w.id} className={`chip${type === w.id ? ' on' : ''}`} onClick={() => setType(w.id)}>{w.emoji} {w.label}</button>
          ))}
        </div>
        <div className="grid2" style={{ marginTop: 12 }}>
          <Field label="Duration (min)"><input type="number" inputMode="numeric" value={dur} onChange={(e) => setDur(e.target.value)} /></Field>
          <Field label="Start time"><input type="time" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label="Distance (km, optional)"><input type="number" inputMode="decimal" value={dist} onChange={(e) => setDist(e.target.value)} /></Field>
          <Field label="Calories burned (optional)" hint="Only if your device reports it."><input type="number" inputMode="numeric" value={cal} onChange={(e) => setCal(e.target.value)} /></Field>
        </div>
        <div style={{ marginTop: 10 }}><Field label="Notes"><input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field></div>
        <button className="btn primary block" style={{ marginTop: 14 }} onClick={() => void save()}>Save workout</button>
      </Sheet>
    </section>
  );
}

function HabitsSection({ date }: { date: string }) {
  const app = useApp();
  const e = app.evals.get(date) ?? app.todayEval;
  const habits = app.habits.filter((h) => h.id in e.habitComplete);
  return (
    <section id="habits" className="card section">
      <div className="row between"><h2>✅ Habits</h2><a className="small sub" href="#/settings/habits">Manage</a></div>
      {habits.length === 0 && <p className="sub small">No habits yet. <a href="#/settings/habits" style={{ color: 'var(--accent)' }}>Add one</a> — like stretching, reading, or no sugary drinks.</p>}
      {habits.map((h) => {
        const v = e.totals.habits[h.id] ?? 0;
        const done = v >= h.target;
        const streak = app.streaks.habits[h.id]?.current ?? 0;
        return (
          <div key={h.id} className="list-item">
            <span style={{ fontSize: 22 }}>{h.emoji}</span>
            <div className="grow">
              <b>{h.name}</b>
              <div className="tiny muted">{h.unit ? `${v} / ${h.target} ${h.unit}` : done ? 'Done' : 'Open'}{streak ? ` · 🔥 ${streak}` : ''}</div>
            </div>
            {h.unit ? (
              <div className="row" style={{ gap: 6 }}>
                <button className="icon-btn" aria-label="decrease" onClick={() => void setHabitValue(h.id, date, v - (h.target >= 10 ? 5 : 1))}>−</button>
                <button className="icon-btn" aria-label="increase" onClick={() => void setHabitValue(h.id, date, v + (h.target >= 10 ? 5 : 1))}>+</button>
              </div>
            ) : (
              <button className={`check${done ? ' on' : ''}`} style={{ width: 34, height: 34, cursor: 'pointer', background: done ? 'var(--habits)' : 'transparent', borderColor: done ? 'var(--habits)' : undefined }} aria-pressed={done} onClick={() => void setHabitValue(h.id, date, done ? 0 : 1)}>
                ✓
              </button>
            )}
          </div>
        );
      })}
    </section>
  );
}
