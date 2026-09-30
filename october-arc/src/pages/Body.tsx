import { useState } from 'react';
import { useApp } from '../data/store';
import { deleteWeight, saveWeight } from '../data/repo';
import type { WeightEntry } from '../domain/types';
import { Field, Seg, num, toast } from '../ui/kit';
import { LineChart } from '../ui/charts';

type Metric = 'weightKg' | 'waistCm' | 'chestCm' | 'hipCm';
const METRICS: { id: Metric; label: string; unit: string }[] = [
  { id: 'weightKg', label: 'Weight', unit: 'kg' },
  { id: 'waistCm', label: 'Waist', unit: 'cm' },
  { id: 'chestCm', label: 'Chest', unit: 'cm' },
  { id: 'hipCm', label: 'Hip', unit: 'cm' },
];

export function Body() {
  const app = useApp();
  const [metric, setMetric] = useState<Metric>('weightKg');
  const [date, setDate] = useState(app.today);
  const [vals, setVals] = useState<Record<Metric, string>>({ weightKg: '', waistCm: '', chestCm: '', hipCm: '' });
  const entries = app.weights.filter((w) => w[metric] != null);
  const m = METRICS.find((x) => x.id === metric)!;
  const first = entries[0]?.[metric], last = entries[entries.length - 1]?.[metric];

  async function save() {
    const e: Omit<WeightEntry, 'id' | 'updatedAt'> = { date };
    let any = false;
    for (const x of METRICS) {
      const v = num(vals[x.id]);
      if (v != null && v > 0) { e[x.id] = v; any = true; }
    }
    if (!any) return toast('Enter at least one value');
    const existing = app.weights.find((w) => w.date === date);
    await saveWeight({ ...existing, ...e, id: existing?.id });
    setVals({ weightKg: '', waistCm: '', chestCm: '', hipCm: '' });
    toast('Saved');
  }

  return (
    <div className="fade-in">
      <a className="small sub" href="#/progress">‹ Progress</a>
      <h1 style={{ marginTop: 6 }}>⚖️ Weight & body</h1>
      <p className="small sub">Optional. Numbers change day to day for many reasons (water, food, timing) — look at the trend over weeks, and talk to a professional for health advice.</p>

      <div className="card section">
        <Field label="Date"><input type="date" value={date} max={app.today} onChange={(e) => setDate(e.target.value)} /></Field>
        <div className="grid2" style={{ marginTop: 10 }}>
          {METRICS.map((x) => (
            <Field key={x.id} label={`${x.label} (${x.unit})`}>
              <input type="number" inputMode="decimal" value={vals[x.id]} onChange={(e) => setVals({ ...vals, [x.id]: e.target.value })} />
            </Field>
          ))}
        </div>
        <button className="btn primary block" style={{ marginTop: 12 }} onClick={() => void save()}>Save entry</button>
      </div>

      <div className="card">
        <div className="row between">
          <h2 style={{ margin: 0 }}>Trend</h2>
          <Seg value={metric} onChange={setMetric} options={METRICS.map((x) => ({ id: x.id, label: x.label }))} />
        </div>
        <div style={{ marginTop: 12 }}>
          <LineChart color="var(--sleep)" data={entries.map((e) => ({ label: e.date.slice(5), value: e[metric] ?? null, tip: `${e.date}: ${e[metric]} ${m.unit}` }))} />
        </div>
        {entries.length >= 2 && first != null && last != null && (
          <p className="small sub" style={{ marginBottom: 0 }}>
            {entries.length} entries · change since first entry: {last - first > 0 ? '+' : ''}{(last - first).toFixed(1)} {m.unit}
          </p>
        )}
      </div>

      {app.weights.length > 0 && (
        <div className="card">
          <h2>Entries</h2>
          {[...app.weights].reverse().map((w) => (
            <div key={w.id} className="list-item small">
              <div className="grow">
                <b>{w.date}</b>
                <div className="muted">{METRICS.filter((x) => w[x.id] != null).map((x) => `${x.label} ${w[x.id]} ${x.unit}`).join(' · ')}</div>
              </div>
              <button className="icon-btn" aria-label="Delete entry" onClick={() => void deleteWeight(w.id)}>🗑</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
