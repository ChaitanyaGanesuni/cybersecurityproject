import { useState } from 'react';
import { useApp } from '../data/store';
import { arcDatesFor, saveHabit, saveSettings, startArc } from '../data/repo';
import { FOOD_FLAGS, HABIT_SUGGESTIONS, PRIMARY_GOALS, weightsForGoal } from '../domain/defaults';
import { fmtDateLong } from '../domain/format';
import { monthName } from '../domain/dates';
import type { Goals, PrimaryGoal, Settings } from '../domain/types';
import { Field, Sheet, celebrate, go, num } from '../ui/kit';
import { AccountSection } from './Settings';

export function Onboarding() {
  const app = useApp();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(app.settings.name);
  const [goal, setGoal] = useState<PrimaryGoal>(app.settings.primaryGoal);
  const [g, setG] = useState<Goals>(app.settings.goals);
  const [flags, setFlags] = useState(app.settings.trackedFoodFlags);
  const [habits, setHabits] = useState<string[]>([]);
  const [restore, setRestore] = useState(false);
  const steps = ['Welcome', 'Goal', 'Targets', 'Nutrition', 'Habits', 'Start'];

  async function finish(start: string, end: string) {
    const patch: Partial<Settings> = { onboarded: true, name: name.trim(), primaryGoal: goal, goals: g, trackedFoodFlags: flags, weights: weightsForGoal(goal) };
    const s = await saveSettings(patch);
    for (const h of HABIT_SUGGESTIONS.filter((x) => habits.includes(x.name))) {
      await saveHabit({ ...h, reminderTime: null, active: true }, app.today);
    }
    await startArc(start, end, s);
    celebrate('🔥', `${monthName(start)} Arc begins!`);
    go('#/');
  }

  const next = () => setStep(step + 1);
  return (
    <div className="fade-in" style={{ paddingTop: 20 }}>
      <div className="row" style={{ gap: 4 }}>
        {steps.map((s, i) => <div key={s} style={{ flex: 1, height: 4, borderRadius: 4, background: i <= step ? 'var(--accent)' : 'var(--line)' }} />)}
      </div>

      {step === 0 && (
        <div className="section">
          <div style={{ fontSize: 56 }}>🔥</div>
          <div className="eyebrow">October Arc</div>
          <h1>A month of showing up.</h1>
          <p className="sub">Track water, steps, sleep, movement and food — and build streaks you actually keep. Missed a goal? Recover fast. Consistency beats perfection.</p>
          <Field label="What should we call you? (optional)"><input type="text" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <p className="tiny muted">Your data stays on this device unless you turn on sync.</p>
          <button className="btn primary block" onClick={next}>Let's set it up</button>
          <button className="btn ghost block" style={{ marginTop: 10 }} onClick={() => setRestore(true)}>I already have an account</button>
          <Sheet open={restore} onClose={() => setRestore(false)}>
            <AccountSection />
          </Sheet>
        </div>
      )}

      {step === 1 && (
        <div className="section">
          <h1>What is your primary goal?</h1>
          <div className="stack section">
            {PRIMARY_GOALS.map((p) => (
              <button key={p.id} className={`chip${goal === p.id ? ' on' : ''}`} style={{ width: '100%', justifyContent: 'flex-start', padding: 14 }} onClick={() => setGoal(p.id)}>
                <span style={{ fontSize: 22 }}>{p.emoji}</span> {p.label}
              </button>
            ))}
          </div>
          <button className="btn primary block section" onClick={next}>Continue</button>
        </div>
      )}

      {step === 2 && (
        <div className="section">
          <h1>Daily targets</h1>
          <p className="sub">Pick targets you can hit on an ordinary day. You can change them anytime.</p>
          <div className="grid2 section">
            <Field label="💧 Water (L)"><input type="number" step={0.25} value={g.waterMl / 1000} onChange={(e) => setG({ ...g, waterMl: Math.round((num(e.target.value) ?? 0) * 1000) })} /></Field>
            <Field label="🚶 Steps"><input type="number" step={500} value={g.steps} onChange={(e) => setG({ ...g, steps: num(e.target.value) ?? 0 })} /></Field>
            <Field label="😴 Sleep (hours)"><input type="number" step={0.25} value={g.sleepMin / 60} onChange={(e) => setG({ ...g, sleepMin: Math.round((num(e.target.value) ?? 0) * 60) })} /></Field>
            <Field label="🏃 Exercise (min)"><input type="number" step={5} value={g.exerciseMin} onChange={(e) => setG({ ...g, exerciseMin: num(e.target.value) ?? 0 })} /></Field>
          </div>
          <button className="btn primary block section" disabled={!g.waterMl || !g.steps || !g.sleepMin || !g.exerciseMin} onClick={next}>Continue</button>
        </div>
      )}

      {step === 3 && (
        <div className="section">
          <h1>Nutrition (optional)</h1>
          <p className="sub">Leave blank to simply log meals without numeric targets.</p>
          <div className="grid2 section">
            <Field label="Calories / day"><input type="number" placeholder="Not tracked" value={g.calories ?? ''} onChange={(e) => setG({ ...g, calories: num(e.target.value) || null })} /></Field>
            <Field label="Protein g / day"><input type="number" placeholder="Not tracked" value={g.proteinG ?? ''} onChange={(e) => setG({ ...g, proteinG: num(e.target.value) || null })} /></Field>
          </div>
          <p className="tiny muted">If you're unsure what's right for you, a registered dietitian can help. October Arc won't suggest aggressive deficits.</p>
          <h3 className="section">Food quality to track</h3>
          <div className="chips">
            {FOOD_FLAGS.map((f) => {
              const on = flags.includes(f.id);
              return <button key={f.id} className={`chip${on ? ' on' : ''}`} onClick={() => setFlags(on ? flags.filter((x) => x !== f.id) : [...flags, f.id])}>{f.emoji} {f.label}</button>;
            })}
          </div>
          <button className="btn primary block section" onClick={next}>Continue</button>
        </div>
      )}

      {step === 4 && (
        <div className="section">
          <h1>Daily habits</h1>
          <p className="sub">Pick a few (or none). Fewer, well-chosen habits stick better.</p>
          <div className="chips section">
            {HABIT_SUGGESTIONS.map((h) => {
              const on = habits.includes(h.name);
              return <button key={h.name} className={`chip${on ? ' on' : ''}`} onClick={() => setHabits(on ? habits.filter((x) => x !== h.name) : [...habits, h.name])}>{h.emoji} {h.name}{h.unit ? ` · ${h.target} ${h.unit}` : ''}</button>;
            })}
          </div>
          <button className="btn primary block section" onClick={next}>Continue</button>
        </div>
      )}

      {step === 5 && <ArcPicker onPick={(a, b) => void finish(a, b)} />}
    </div>
  );
}

/** `after`: pick the month following this date (defaults to today). */
export function ArcPicker({ onPick, after }: { onPick: (start: string, end: string) => void; after?: string }) {
  const { today } = useApp();
  const next = arcDatesFor('nextMonth', after ?? today);
  const now = arcDatesFor('today30', today);
  return (
    <div className="section">
      <h1>When does your arc start?</h1>
      <button className="card block" style={{ width: '100%', textAlign: 'left', cursor: 'pointer', color: 'inherit' }} onClick={() => onPick(next.start, next.end)}>
        <b>🍂 {monthName(next.start)} Arc</b>
        <div className="small sub">{fmtDateLong(next.start)} → {fmtDateLong(next.end)}</div>
        <div className="tiny muted">Days before the start are practice days.</div>
      </button>
      <button className="card block" style={{ width: '100%', textAlign: 'left', cursor: 'pointer', color: 'inherit', marginTop: 12 }} onClick={() => onPick(now.start, now.end)}>
        <b>⚡ Start today — 30 days</b>
        <div className="small sub">{fmtDateLong(now.start)} → {fmtDateLong(now.end)}</div>
      </button>
    </div>
  );
}
