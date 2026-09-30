import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';

// ---------- routing (hash based: works offline and on any static host) ----------

export interface Route {
  path: string[];
  query: URLSearchParams;
}

function parse(): Route {
  const h = location.hash.replace(/^#/, '') || '/';
  const [p, q] = h.split('?');
  return { path: p.split('/').filter(Boolean), query: new URLSearchParams(q ?? '') };
}

export function useRoute(): Route {
  const [r, setR] = useState(parse);
  useEffect(() => {
    const on = () => {
      setR(parse());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return r;
}

export const go = (href: string) => {
  location.hash = href.replace(/^#/, '');
};

// ---------- progress ----------

export function Ring({ value, size = 160, stroke = 14, color = 'var(--accent)', children }: { value: number; size?: number; stroke?: number; color?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} role="img" aria-label={`${Math.round(v * 100)}%`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.2,0.8,0.2,1)' }}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>{children}</div>
    </div>
  );
}

export function Bar({ value, color, thick }: { value: number; color?: string; thick?: boolean }) {
  return (
    <div className={`bar${thick ? ' thick' : ''}`} style={{ '--c': color } as CSSProperties}>
      <i style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  );
}

export function WaterGlass({ value }: { value: number }) {
  const v = Math.max(0, Math.min(1, value));
  const top = 20 + (1 - v) * 130;
  return (
    <svg className="water-glass" viewBox="0 0 120 160" role="img" aria-label={`Water ${Math.round(v * 100)}%`}>
      <defs>
        <clipPath id="glass">
          <path d="M14 8 L106 8 L96 150 Q95 156 88 156 L32 156 Q25 156 24 150 Z" />
        </clipPath>
      </defs>
      <g clipPath="url(#glass)">
        <rect x="0" y="0" width="120" height="160" fill="var(--surface-2)" />
        <g style={{ transform: `translateY(${top}px)`, transition: 'transform 0.9s cubic-bezier(0.2,0.8,0.2,1)' }}>
          <path
            d="M0 6 Q15 0 30 6 T60 6 T90 6 T120 6 T150 6 T180 6 T210 6 T240 6 V200 H0 Z"
            fill="var(--water)"
            opacity="0.9"
            style={{ animation: 'wave 3s linear infinite' }}
          />
        </g>
      </g>
      <path d="M14 8 L106 8 L96 150 Q95 156 88 156 L32 156 Q25 156 24 150 Z" fill="none" stroke="var(--line)" strokeWidth="3" />
    </svg>
  );
}

// ---------- overlays ----------

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        {title && <h2>{title}</h2>}
        {children}
      </div>
    </div>
  );
}

type ToastFn = (msg: string) => void;
let toastFn: ToastFn = () => {};
export const toast: ToastFn = (m) => toastFn(m);

type CelebrateFn = (emoji: string, text: string) => void;
let celebrateFn: CelebrateFn = () => {};
export const celebrate: CelebrateFn = (e, t) => celebrateFn(e, t);

const CONFETTI = ['var(--accent)', 'var(--water)', 'var(--steps)', 'var(--sleep)', 'var(--diet)', 'var(--habits)'];

export function Overlays() {
  const [msg, setMsg] = useState<string | null>(null);
  const [party, setParty] = useState<{ e: string; t: string; k: number } | null>(null);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    toastFn = (m) => {
      setMsg(m);
      clearTimeout(t);
      t = setTimeout(() => setMsg(null), 2400);
    };
    let c: ReturnType<typeof setTimeout>;
    celebrateFn = (e, text) => {
      setParty({ e, t: text, k: Date.now() });
      clearTimeout(c);
      c = setTimeout(() => setParty(null), 2000);
      navigator.vibrate?.(30);
    };
  }, []);
  return (
    <>
      {msg && <div className="toast" role="status">{msg}</div>}
      {party && (
        <div key={party.k}>
          {Array.from({ length: 28 }, (_, i) => (
            <i
              key={i}
              className="confetti"
              style={{ left: `${(i * 37) % 100}%`, background: CONFETTI[i % CONFETTI.length], animationDelay: `${(i % 7) * 0.06}s` }}
            />
          ))}
          <div className="celebrate" aria-live="polite">
            <div className="burst">
              <span className="e">{party.e}</span>
              <span className="t">{party.t}</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ---------- form bits ----------

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <div className="tiny muted" style={{ marginTop: 4 }}>{hint}</div>}
    </label>
  );
}

export function Seg<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="tablist">
      {options.map((o) => (
        <button key={o.id} role="tab" aria-selected={o.id === value} className={o.id === value ? 'on' : ''} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const num = (s: string): number | undefined => {
  if (s.trim() === '') return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
};
