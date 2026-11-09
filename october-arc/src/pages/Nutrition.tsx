import { useApp } from '../data/store';
import { aggregateDay, emptyRawDay } from '../domain/scoring';
import { addDays } from '../domain/dates';
import { fmtDateLong, fmtInt } from '../domain/format';
import { GROUP_LABELS, NUTRIENTS, fmtNutrient, sumNutrients, type NutrientGroup } from '../domain/nutrients';
import { Bar, useRoute } from '../ui/kit';

/** Day Summary: macros, meals and detailed nutrients against reference daily values. */
export function Nutrition() {
  const app = useApp();
  const route = useRoute();
  const date = route.query.get('date') ?? app.today;
  const raw = app.raw.get(date) ?? emptyRawDay(date);
  const t = aggregateDay(raw);
  const g = app.settings.goals;
  const n = sumNutrients(raw.meals);
  const meals = [...raw.meals].sort((a, b) => a.at - b.at);
  const groups: NutrientGroup[] = ['carbs', 'lipids', 'vitamins', 'minerals', 'other'];

  const macro = (label: string, value: string, target: number | null, actual: number, color: string) => (
    <div className="stat">
      <div className="l">{label}</div>
      <div className="v" style={{ color }}>{value}</div>
      {target ? (
        <>
          <Bar value={actual / target} color={color} />
          <div className="tiny muted" style={{ marginTop: 4 }}>{Math.round((actual / target) * 100)}% of your target</div>
        </>
      ) : (
        <div className="tiny muted">no target set</div>
      )}
    </div>
  );

  return (
    <div className="fade-in">
      <a className="small sub" href={`#/food?date=${date}`}>‹ Food diary</a>
      <h1 style={{ marginTop: 6 }}>Day Summary</h1>
      <div className="row small" style={{ marginTop: 6 }}>
        <a className="chip" href={`#/nutrition?date=${addDays(date, -1)}`}>‹ Prev</a>
        <span className="sub grow center">{fmtDateLong(date)}</span>
        {date < app.today && <a className="chip" href={`#/nutrition?date=${addDays(date, 1)}`}>Next ›</a>}
      </div>

      <div className="grid2 section">
        {macro('Calories', `${fmtInt(t.calories)} kcal`, g.calories, t.calories, 'var(--diet)')}
        {macro('Protein', `${Math.round(t.protein)} g`, g.proteinG, t.protein, 'var(--steps)')}
        {macro('Carbs', `${Math.round(t.carbs)} g`, null, t.carbs, 'var(--water)')}
        {macro('Fat', `${Math.round(t.fat)} g`, null, t.fat, 'var(--exercise)')}
      </div>

      <div className="card section">
        <h2>Meals</h2>
        {meals.length === 0 && <p className="sub small">Nothing logged for this day.</p>}
        {meals.map((m) => {
          const kcal = m.items.reduce((a, i) => a + (i.calories ?? 0), 0);
          return (
            <div key={m.id} className="list-item small">
              <div className="grow">
                <b>{m.title ?? m.items.map((i) => i.name).join(', ')}</b>
                <div className="tiny muted">{new Date(m.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}{m.items.some((i) => i.estimated) ? ' · ✨ includes estimates' : m.items.some((i) => i.usda) ? ' · 📗 USDA data' : ''}</div>
              </div>
              <span>{kcal ? `${fmtInt(kcal)} kcal` : '—'}</span>
            </div>
          );
        })}
      </div>

      <div className="section">
        <h2>Nutritional information</h2>
        {n.itemsWithDetail === 0 ? (
          <p className="sub small">
            No detailed nutrient data for this day yet. Vitamins and minerals appear for meals logged with ✨ AI logging (or items that include them).
          </p>
        ) : (
          <p className="tiny muted" style={{ marginTop: -4 }}>
            Based on {n.itemsWithDetail} of {n.items} food item{n.items === 1 ? '' : 's'}
            {n.usdaItems || n.estimatedItems ? ` (${[n.usdaItems ? `${n.usdaItems} from USDA lab data` : '', n.estimatedItems ? `${n.estimatedItems} AI estimate${n.estimatedItems === 1 ? '' : 's'}` : ''].filter(Boolean).join(', ')})` : ''}. Percentages compare with general adult reference daily values used on food labels — a rough guide, not a personal requirement or medical advice.
          </p>
        )}
        {n.itemsWithDetail > 0 &&
          groups.map((grp) => {
            const rows = NUTRIENTS.filter((d) => d.group === grp && n.values[d.key] != null);
            if (!rows.length) return null;
            return (
              <div key={grp} className="card">
                <h3>{GROUP_LABELS[grp]}</h3>
                {rows.map((d) => {
                  const v = n.values[d.key]!;
                  const ratio = d.dv ? v / d.dv : null;
                  const limit = 'limit' in d && d.limit;
                  return (
                    <div key={d.key} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 90px', gap: 8, alignItems: 'center', padding: '5px 0' }} className="small">
                      <span>{d.label}{limit ? <span className="tiny muted"> · limit</span> : null}</span>
                      <span className="sub" style={{ textAlign: 'right' }}>{fmtNutrient(v, d.unit)}</span>
                      {ratio != null ? (
                        <div className="row" style={{ gap: 6 }}>
                          <div className="grow"><Bar value={ratio} color={limit && ratio > 1 ? 'var(--warn)' : 'var(--steps)'} /></div>
                          <span className="tiny muted" style={{ width: 34, textAlign: 'right' }}>{Math.round(ratio * 100)}%</span>
                        </div>
                      ) : (
                        <span />
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
      </div>
    </div>
  );
}
