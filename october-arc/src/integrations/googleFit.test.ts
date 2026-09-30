import { describe, expect, it } from 'vitest';
import { ESTIMATED_STEPS, fetchSteps, parseSteps, stepsRequest } from './googleFit';

describe('Google Fit step import', () => {
  it('asks for one local day from the estimated_steps source', () => {
    const r = stepsRequest('2026-10-12');
    expect(r.aggregateBy[0].dataSourceId).toBe(ESTIMATED_STEPS);
    expect(r.startTimeMillis).toBe(new Date(2026, 9, 12).getTime());
    expect(r.endTimeMillis).toBe(new Date(2026, 9, 13).getTime());
    expect(r.bucketByTime.durationMillis).toBe(r.endTimeMillis - r.startTimeMillis);
  });

  it('sums points and distinguishes "no data" from zero', () => {
    expect(parseSteps({ bucket: [{ dataset: [{ point: [{ value: [{ intVal: 4000 }] }, { value: [{ intVal: 2820 }] }] }] }] })).toBe(6820);
    expect(parseSteps({ bucket: [{ dataset: [{ point: [] }] }] })).toBeNull();
    expect(parseSteps({})).toBeNull();
  });

  it('sends the bearer token and surfaces API refusals clearly', async () => {
    let seen: RequestInit | undefined;
    const ok = (async (_u: string, init: RequestInit) => {
      seen = init;
      return new Response(JSON.stringify({ bucket: [{ dataset: [{ point: [{ value: [{ intVal: 123 }] }] }] }] }), { status: 200 });
    }) as unknown as typeof fetch;
    expect(await fetchSteps('2026-10-12', 'tok', ok)).toBe(123);
    expect((seen!.headers as Record<string, string>).authorization).toBe('Bearer tok');

    const denied = (async () => new Response(JSON.stringify({ error: { message: 'Fitness API has not been used in project' } }), { status: 403 })) as unknown as typeof fetch;
    await expect(fetchSteps('2026-10-12', 'tok', denied)).rejects.toThrow(/Fitness API has not been used/);
  });
});
