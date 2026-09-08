import { describe, it, expect } from 'vitest';
import { ClingoContext, clearCache } from '../lib/index.js';

const KNOWLEDGE = `
card(a). card(b). parent(b, a).
field(a, "title", "A"). field(b, "title", "B").
ancestor(X, Y) :- parent(X, Y).
ancestor(X, Z) :- parent(X, Y), ancestor(Y, Z).
`;
const QUERY_LAYER = `
result(K) :- want(K).
#show result/1.
#show field(K, F, V) : result(K), field(K, F, V).
`;

describe('commit()', () => {
  it('materializes the knowledge layer as a snapshot', async () => {
    clearCache();
    const ctx = new ClingoContext();
    ctx.setProgram('facts', KNOWLEDGE, ['knowledge']);
    ctx.setProgram('ql', QUERY_LAYER, ['queryLayer']);
    const snap = await ctx.commit();
    expect(snap.revision).toBe(1);
    expect(snap.atoms).toBe(6); // card×2, parent, field×2, ancestor(b,a)
    expect(snap.stats.ground).toBeGreaterThan(0);
    const again = await ctx.commit();
    expect(again.revision).toBe(2);
  });

  it('rejects when there is no knowledge program', async () => {
    const ctx = new ClingoContext();
    await expect(ctx.commit()).rejects.toThrow(/no programs in category "knowledge"/);
  });
});
