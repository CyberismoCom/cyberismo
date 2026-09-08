import { describe, it, expect } from 'vitest';
import { ClingoContext, ClingoError, clearCache } from '../lib/index.js';

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
    // commit() does not read or write the shared solve result cache, so unlike solve()
    // tests this needs no clearCache() -- each test already gets its own ClingoContext,
    // and thus its own revision counter.
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

  it('rejects with a structured ClingoError when a knowledge program fails to ground', async () => {
    const ctx = new ClingoContext();
    ctx.setProgram('bad', 'foo(X).', ['knowledge']);

    try {
      await ctx.commit();
      expect.fail('Expected commit() to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(ClingoError);
      const clingoError = error as ClingoError;
      expect(clingoError.details.errors.length).toBeGreaterThan(0);
      expect(clingoError.details.errors.join('\n')).toContain('unsafe');
      // Unlike a parse error (see solve.test.ts's "reports the program key" test), this
      // failure surfaces from control.ground() itself, after groundPrograms() has already
      // cleared `currentKey` for the ground phase -- the native side has no offending
      // program to attach here, so details.program is absent.
      expect(clingoError.details.program).toBeUndefined();
    }
  });

  it('keeps revisions distinct when two commits race on the pool', async () => {
    const ctx = new ClingoContext();
    ctx.setProgram('facts', KNOWLEDGE, ['knowledge']);

    const [a, b] = await Promise.all([ctx.commit(), ctx.commit()]);

    expect([a.revision, b.revision].sort((x, y) => x - y)).toEqual([1, 2]);
    // The public API has no way to read back which snapshot ended up installed, so this
    // is as far as JS can observe the out-of-order-install guard: both commits resolve,
    // with distinct, ordered revisions, regardless of which one the pool finishes first.
    // What this test does exercise directly is two concurrent groundPrograms() replays of
    // the same shared Program::ast_nodes (both commits reference the same stored 'facts'
    // program) -- that must not crash or corrupt either result.
  });

  it('rejects when the knowledge layer is unsatisfiable', async () => {
    const ctx = new ClingoContext();
    ctx.setProgram('facts', `${KNOWLEDGE}\n:- card(a).`, ['knowledge']);
    await expect(ctx.commit()).rejects.toThrow(/unsatisfiable/);
  });
});

describe('solve({ snapshot: true })', () => {
  it('equals the full solve and uses the cache', async () => {
    clearCache();
    const ctx = new ClingoContext();
    ctx.setProgram('facts', KNOWLEDGE, ['knowledge']);
    ctx.setProgram('ql', QUERY_LAYER, ['queryLayer']);
    await ctx.commit();
    const q = 'want(b).';
    const full = await ctx.solve(q, ['knowledge', 'queryLayer']);
    const snap = await ctx.solve(q, ['queryLayer'], { snapshot: true });
    const norm = (r: { answers: string[] }) => r.answers[0].split('\n').sort();
    expect(norm(snap)).toEqual(norm(full));
    expect(snap.stats.cacheHit).toBe(false);
    const again = await ctx.solve(q, ['queryLayer'], { snapshot: true });
    expect(again.stats.cacheHit).toBe(true);
  });

  it('rejects with SNAPSHOT_STALE after the knowledge layer changes', async () => {
    const ctx = new ClingoContext();
    ctx.setProgram('facts', KNOWLEDGE, ['knowledge']);
    ctx.setProgram('ql', QUERY_LAYER, ['queryLayer']);
    await ctx.commit();

    // Sanity check: the snapshot is usable right after commit, so the
    // rejection below is caused by the knowledge change, not by something
    // else about this setup.
    await expect(
      ctx.solve('want(b).', ['queryLayer'], { snapshot: true }),
    ).resolves.toBeDefined();

    ctx.setProgram('facts', KNOWLEDGE + 'card(c).', ['knowledge']);
    await expect(
      ctx.solve('want(c).', ['queryLayer'], { snapshot: true }),
    ).rejects.toMatchObject({ code: 'SNAPSHOT_STALE' });

    // And committing against the changed knowledge programs clears the
    // staleness -- confirms it is the knowledge-hash mismatch that trips
    // this, not e.g. every solve() after any setProgram() call.
    await ctx.commit();
    await expect(
      ctx.solve('want(c).', ['queryLayer'], { snapshot: true }),
    ).resolves.toBeDefined();
  });

  it('rejects with SNAPSHOT_MISSING before any commit', async () => {
    const ctx = new ClingoContext();
    ctx.setProgram('ql', QUERY_LAYER, ['queryLayer']);
    await expect(
      ctx.solve('want(a).', ['queryLayer'], { snapshot: true }),
    ).rejects.toMatchObject({ code: 'SNAPSHOT_MISSING' });
  });

  it('is not invalidated by a queryLayer-only change, and reflects the new query layer', async () => {
    const ctx = new ClingoContext();
    ctx.setProgram('facts', KNOWLEDGE, ['knowledge']);
    ctx.setProgram('ql', QUERY_LAYER, ['queryLayer']);
    await ctx.commit();

    // QUERY_LAYER's #show directives only surface result/1 and field/3, so the added
    // predicate needs its own #show to be observable in the answer set.
    ctx.setProgram('ql', QUERY_LAYER + '\n#show extra/1.\nextra(1).', ['queryLayer']);

    const result = await ctx.solve('want(b).', ['queryLayer'], { snapshot: true });
    expect(result.answers[0]).toContain('extra(1)');
  });
});
