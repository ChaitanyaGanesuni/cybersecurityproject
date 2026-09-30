import { useState, type CSSProperties } from 'react';
import { useApp } from '../data/store';
import { addDays, dateRange } from '../domain/dates';
import { arcScore, periodStats, sleepStats } from '../domain/analytics';
import { CATEGORY_META } from '../domain/defaults';
import { fmtDuration, fmtInt, fmtLiters, fmtTime12 } from '../domain/format';
import type { DayEval, ScoreKey } from '../domain/types';
import { Bar, Ring, Seg } from '../ui/kit';
import { BarChart } from '../ui/charts';
import { COLOR } from '../ui/goals';

export function Progress() {
  const app = useApp();
  const s = app.settings;
  const [tab, setTab] = useState<'week' | 'month'>('week');

  // Arc score: finished arc days, plus today once it has any data.
  const arcEvals = [...app.pastArcEvals, ...(app.todayEval.hasData && app.arcDates.includes(app.today) ? [app.todayEval] : [])];
  const score = arcScore(arcEvals, s);
  const weekDates = dateRange(addDays(app.today, -6), app.today);
  const weekEvals = weekDates.map((d) => app.evals.get(d)).filter((e): e is DayEval => !!e);
  const periodDates = tab === 'week' ? weekDates : app.arcDates;
  const periodEvals = tab === 'week' ? weekEvals : arcEvals;
  const st = periodStats(periodEvals);
  const sl = sleepStats(periodEvals, s.goals.sleepMin);
  const n = periodEvals.length || 1;
  const o = app.streaks.overall;

  const series = (f: (e: DayEval) => number | null, tip: (v: number, d: string) => string) =>
    periodDates.map((d) => {
      const e = app.evals.get(d);
      const v = e ? f(e) : null;
      return { label: d.slice(8), value: v, tip: v == null ? `${d.slice(5)}: –` : tip(v, d.slice(5)) };
    });

  return (
    <div className="fade-in">
      <div className="eyebrow" style={{ marginTop: 4 }}>Progress</div>
      <h1>{app.arc?.name ?? 'Your arc'} Score</h1>

      <div className="card hero section">
        <div className="row" style={{ gap: 18 }}>
          <Ring value={score.score / 100} size={120} stroke={11}>
            <div className="big-num" style={{ fontSize: 30 }}>{Math.round(score.score)}%</div>
          </Ring>
          <div className="grow">
            {score.breakdown.map((b) => (
              <div key={b.key} style={{ marginBottom: 6 }}>
                <div className="row between tiny"><span>{CATEGORY_META[b.key].emoji} {CATEGORY_META[b.key].label} <span className="muted">({b.weight}%)</span></span><b>{Math.round(b.pct)}%</b></div>
                <Bar value={b.pct / 100} color={COLOR[b.key]} />
              </div>
            ))}
          </div>
        </div>
        <p className="tiny muted" style={{ marginBottom: 0 }}>A consistency score from your own targets and weights (editable in Settings). It is not a health or medical measure.</p>
      </div>

      <div className="section">
        <h2>Streaks</h2>
        <div className="grid2">
          <StreakTile emoji="🔥" label="Overall" cur={o.current} best={o.longest} prev={o.previous} big />
          {(['water', 'steps', 'exercise', 'sleep', 'diet'] as ScoreKey[]).filter((k) => s.policies[k] !== 'none').map((k) => (
            <StreakTile key={k} emoji={CATEGORY_META[k].emoji} label={CATEGORY_META[k].label} cur={app.streaks.categories[k].current} best={app.streaks.categories[k].longest} />
          ))}
          {app.activeHabits.map((h) => (
            <StreakTile key={h.id} emoji={h.emoji} label={h.name} cur={app.streaks.habits[h.id]?.current ?? 0} best={app.streaks.habits[h.id]?.longest ?? 0} />
          ))}
        </div>
        <p className="tiny muted">A streak day counts only when that goal reaches its full target. Overall streak rules are in Settings → Streak rules.</p>
      </div>

      <div className="row between section">
        <h2 style={{ margin: 0 }}>{tab === 'week' ? 'Last 7 days' : 'This arc'}</h2>
        <Seg value={tab} onChange={setTab} options={[{ id: 'week', label: 'Week' }, { id: 'month', label: 'Arc' }]} />
      </div>

      {periodEvals.length === 0 ? (
        <p className="sub">No data for this period yet.</p>
      ) : (
        <>
          <div className="grid3" style={{ marginTop: 12 }}>
            {tab === 'month' && <Stat v={fmtInt(st.totalSteps)} l="Total steps" />}
            <Stat v={fmtInt(st.avgSteps)} l="Avg steps" />
            {tab === 'month' && <Stat v={fmtLiters(st.totalWaterMl)} l="Total water" />}
            <Stat v={fmtLiters(st.avgWaterMl)} l="Avg water" />
            <Stat v={st.avgSleepMin ? fmtDuration(st.avgSleepMin) : '–'} l="Avg sleep" />
            <Stat v={`${st.exerciseDays}/${n}`} l="Exercise days" />
            {tab === 'month' && <Stat v={fmtDuration(st.totalExerciseMin)} l="Workout time" />}
            <Stat v={`${st.dietDays}/${n}`} l="Diet on track" />
            <Stat v={`${Math.round(st.avgScore)}%`} l="Avg daily score" />
            {tab === 'month' && <Stat v={`${st.completedDays}`} l="Completed days" />}
            {tab === 'month' && <Stat v={`${st.missedDays}`} l="Missed days" />}
            {tab === 'month' && <Stat v={`${o.longest}`} l="Longest streak" />}
          </div>

          <div className="card section">
            <h3>Daily score</h3>
            <BarChart color="var(--accent)" goal={s.minDayScore} goalLabel="streak min" data={series((e) => e.score, (v, d) => `${d}: ${Math.round(v)}%`)} />
          </div>
          <div className="card">
            <h3>🚶 Steps</h3>
            <BarChart color="var(--steps)" goal={s.goals.steps} data={series((e) => e.totals.steps, (v, d) => `${d}: ${fmtInt(v)}`)} />
          </div>
          <div className="card">
            <h3>💧 Water (L)</h3>
            <BarChart color="var(--water)" goal={s.goals.waterMl / 1000} data={series((e) => e.totals.waterMl / 1000, (v, d) => `${d}: ${v.toFixed(2)} L`)} />
          </div>
          <div className="card">
            <h3>🏃 Exercise (min)</h3>
            <BarChart color="var(--exercise)" goal={s.goals.exerciseMin} data={series((e) => e.totals.exerciseMin, (v, d) => `${d}: ${v} min`)} />
          </div>
          <div className="card">
            <h3>😴 Sleep</h3>
            <BarChart color="var(--sleep)" goal={s.goals.sleepMin / 60} goalLabel="target" data={series((e) => (e.totals.sleepMin == null ? null : e.totals.sleepMin / 60), (v, d) => `${d}: ${fmtDuration(v * 60)}`)} />
            {sl.nights > 0 && (
              <div className="grid2" style={{ marginTop: 10 }}>
                <Stat v={fmtDuration(sl.avgMin)} l="Average sleep" />
                <Stat v={fmtDuration(sl.debtMin)} l="Sleep debt vs target" />
                <Stat v={sl.avgBedtime ? fmtTime12(sl.avgBedtime) : '–'} l="Avg bedtime" />
                <Stat v={sl.avgWake ? fmtTime12(sl.avgWake) : '–'} l="Avg wake-up" />
                <Stat v={sl.consistencyLabel ?? 'Need 3+ nights'} l={sl.bedtimeSpreadMin != null ? `Bedtime ±${sl.bedtimeSpreadMin} min` : 'Consistency'} />
              </div>
            )}
          </div>
        </>
      )}

      {s.showBodyTracking && (
        <a className="card row section" href="#/body">
          <span style={{ fontSize: 24 }}>⚖️</span>
          <div className="grow"><b>Weight & body</b><div className="small sub">Track weight and measurements over time.</div></div>
          <span>›</span>
        </a>
      )}
    </div>
  );
}

function Stat({ v, l }: { v: string; l: string }) {
  return <div className="stat"><div className="v">{v}</div><div className="l">{l}</div></div>;
}

function StreakTile({ emoji, label, cur, best, prev, big }: { emoji: string; label: string; cur: number; best: number; prev?: number; big?: boolean }) {
  return (
    <div className="stat" style={big ? ({ gridColumn: '1 / -1', background: 'color-mix(in srgb, var(--accent) 14%, var(--surface-2))' } as CSSProperties) : undefined}>
      <div className="l">{emoji} {label}</div>
      <div className="v">{cur} day{cur === 1 ? '' : 's'}</div>
      <div className="tiny muted">🏆 Longest {best}{prev != null && cur === 0 && prev > 0 ? ` · Previous ${prev}` : ''}</div>
    </div>
  );
}
