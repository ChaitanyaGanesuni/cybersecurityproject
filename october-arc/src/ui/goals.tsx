import type { CSSProperties } from 'react';
import { CATEGORY_META } from '../domain/defaults';
import { dietProgress } from '../domain/scoring';
import { fmtDuration, fmtInt, fmtLiters } from '../domain/format';
import type { DayEval, ScoreKey, Settings } from '../domain/types';
import { Bar } from './kit';

export const COLOR: Record<ScoreKey, string> = {
  water: 'var(--water)',
  steps: 'var(--steps)',
  sleep: 'var(--sleep)',
  exercise: 'var(--exercise)',
  diet: 'var(--diet)',
  habits: 'var(--habits)',
};

export interface GoalLine {
  key: ScoreKey;
  label: string;
  emoji: string;
  value: string;
  remaining: string | null;
  progress: number;
  done: boolean;
}

export function goalLine(k: ScoreKey, e: DayEval, s: Settings): GoalLine {
  const g = s.goals, t = e.totals;
  const meta = CATEGORY_META[k];
  const base = { key: k, label: meta.label, emoji: meta.emoji, progress: e.progress[k], done: e.complete[k] };
  switch (k) {
    case 'water':
      return { ...base, value: `${fmtLiters(t.waterMl)} / ${fmtLiters(g.waterMl)}`, remaining: e.complete.water ? null : `${Math.max(0, g.waterMl - t.waterMl)} ml remaining` };
    case 'steps':
      return { ...base, value: `${fmtInt(t.steps)} / ${fmtInt(g.steps)}`, remaining: e.complete.steps ? null : `${fmtInt(Math.max(0, g.steps - t.steps))} remaining` };
    case 'sleep':
      return { ...base, value: t.sleepMin == null ? 'Not logged' : `${fmtDuration(t.sleepMin)} / ${fmtDuration(g.sleepMin)}`, remaining: t.sleepMin == null ? 'Log last night' : null };
    case 'exercise':
      return { ...base, value: t.exerciseMin ? `${t.exerciseMin} / ${g.exerciseMin} min` : 'Not completed', remaining: e.complete.exercise ? null : `${Math.max(0, g.exerciseMin - t.exerciseMin)} min remaining` };
    case 'diet': {
      const { progress } = dietProgress(t, s);
      const label = t.mealsLogged === 0 ? 'Nothing logged' : progress >= 1 ? 'Completed' : progress >= 0.75 ? 'Good' : 'In progress';
      const extra = g.calories ? ` · ${fmtInt(t.calories)} kcal` : '';
      return { ...base, value: label + extra, remaining: null };
    }
    case 'habits': {
      const ids = Object.keys(e.habitComplete);
      const done = ids.filter((id) => e.habitComplete[id]).length;
      return { ...base, value: `${done} / ${ids.length} done`, remaining: done < ids.length ? `${ids.length - done} open` : null };
    }
  }
}

export function GoalRow({ line, href }: { line: GoalLine; href?: string }) {
  const c = COLOR[line.key];
  const body = (
    <div className="goal-row" style={{ '--c': c } as CSSProperties}>
      <div className="goal-emoji">{line.emoji}</div>
      <div className="grow">
        <div className="row between">
          <b>{line.label}</b>
          <span className="small sub">{line.value}</span>
        </div>
        <div style={{ marginTop: 6 }}>
          <Bar value={line.progress} color={c} />
        </div>
        {line.remaining && <div className="tiny muted" style={{ marginTop: 4 }}>{line.remaining}</div>}
      </div>
      <div className={`check${line.done ? ' on' : ''}`} aria-label={line.done ? 'done' : 'open'}>✓</div>
    </div>
  );
  return href ? <a href={href}>{body}</a> : body;
}

export function visibleKeys(e: DayEval, s: Settings): ScoreKey[] {
  return (['water', 'steps', 'sleep', 'exercise', 'diet', 'habits'] as ScoreKey[]).filter(
    (k) => s.policies[k] !== 'none' && (k !== 'habits' || Object.keys(e.habitComplete).length > 0),
  );
}
