/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { ClingoContext, clearCache, type ClingoResult } from '../lib/index.js';

// This file runs under vitest.coalesce.config.ts, which pins NODE_CLINGO_MAX_CONCURRENT=1
// (see that file's own doc comment) so ClingoContext::pump() (src/binding.cc) can be
// exercised deterministically: with exactly one worker slot, a `busy` solve occupies it,
// and every solve({ snapshot: true }) issued while `busy` is still in flight is guaranteed
// to queue up behind it. Once `busy` settles, pump() dispatches the whole queued set
// together as one group -- which, for two or more real (non-cached, parseable) members, now
// means one models-multiplexed solve (buildModels() + ClingoSolver::solveModels()) instead
// of the deleted renamed-and-bridged batch. There is no public multi-query entry point any
// more (solveBatch() is gone): the only way to reach the multiplexer is to make several
// solve() calls collide in the queue exactly like this.
//
// `busy` is always a query on a predicate name none of the real test queries touch, so it
// never shares a cache hash with anything under test and never contributes to any group's
// own answers -- its only job is to occupy the one worker slot.

const occupySlot = (ctx: ClingoContext, refs: string[] = ['queryLayer']) =>
  ctx.solve('__occupy_slot__.', refs, { snapshot: true });

const norm = (r: ClingoResult) =>
  r.answers[0].split('\n').filter(Boolean).sort();

describe('models multiplexing', () => {
  const KNOWLEDGE = `card(a). card(b). card(c). field(a,"title","A"). field(b,"title","B").`;
  const QL = `#show result/1. #show field(K,F,V) : result(K), field(K,F,V). #show childResult/3.`;

  it('matches separate solves atom-for-atom -- set equality and atom counts alike -- for N queries multiplexed together', async () => {
    clearCache();
    const ctx = new ClingoContext();
    ctx.setProgram('facts', KNOWLEDGE, ['knowledge']);
    ctx.setProgram('ql', QL, ['queryLayer']);
    await ctx.commit();

    const qs = [
      'result(a).',
      'result(b). childResult(b, a, "children").',
      'result(K) :- card(K).',
    ];
    const separate: ClingoResult[] = [];
    for (const q of qs) {
      separate.push(await ctx.solve(q, ['queryLayer'], { snapshot: true }));
    }

    clearCache();
    const busy = occupySlot(ctx);
    const multiplexed = await Promise.all(
      qs.map((q) => ctx.solve(q, ['queryLayer'], { snapshot: true })),
    );
    await busy;

    expect(multiplexed.length).toBe(3);
    for (let i = 0; i < qs.length; i++) {
      const sep = norm(separate[i]);
      const mux = norm(multiplexed[i]);
      // Atom counts first: two equally-broken-but-equal sets (e.g. both silently
      // missing the same atom, or one instance's atoms doubled by an accidental
      // duplication) would still pass a bare set-equality check.
      expect(mux.length).toBe(sep.length);
      expect(mux).toEqual(sep);
    }
    // Sanity: this is not passing because every side is trivially empty.
    expect(norm(separate[0]).length).toBeGreaterThan(0);
    expect(norm(separate[2]).length).toBeGreaterThan(0);
    expect(
      Math.max(...multiplexed.map((r) => r.stats.batchSize ?? 0)),
    ).toBeGreaterThan(1);
  });

  it("never lets two instances defining the same predicate with different extensions see each other's atoms", async () => {
    clearCache();
    const ctx = new ClingoContext();
    ctx.setProgram('facts', KNOWLEDGE, ['knowledge']);
    ctx.setProgram('ql', QL, ['queryLayer']);
    await ctx.commit();

    const busy = occupySlot(ctx);
    const [r0, r1] = await Promise.all([
      ctx.solve('result(a).', ['queryLayer'], { snapshot: true }),
      ctx.solve('result(b).', ['queryLayer'], { snapshot: true }),
    ]);
    await busy;

    expect(Math.max(r0.stats.batchSize ?? 0, r1.stats.batchSize ?? 0)).toBe(2);
    expect(r0.answers[0]).toContain('result(a)');
    expect(r0.answers[0]).not.toContain('result(b)');
    expect(r1.answers[0]).toContain('result(b)');
    expect(r1.answers[0]).not.toContain('result(a)');
  });

  it('behaves exactly like a plain snapshot solve for a group that reduces to one real query', async () => {
    clearCache();
    const ctx = new ClingoContext();
    ctx.setProgram('facts', KNOWLEDGE, ['knowledge']);
    ctx.setProgram('ql', QL, ['queryLayer']);
    await ctx.commit();

    // Nothing else is ever in flight here, so this dispatches immediately as a group of
    // one -- dispatchGroup()'s plain (unguarded) solo path, never buildModels() /
    // ClingoSolver::solveModels() at all.
    const first = await ctx.solve('result(a).', ['queryLayer'], {
      snapshot: true,
    });
    clearCache();
    const second = await ctx.solve('result(a).', ['queryLayer'], {
      snapshot: true,
    });

    expect(second.answers).toEqual(first.answers);
    expect(first.stats.batchSize).toBe(1);
    expect(second.stats.batchSize).toBe(1);
  });

  it('yields an empty answer for an individually-unsatisfiable instance without disturbing its satisfiable siblings', async () => {
    clearCache();
    const ctx = new ClingoContext();
    ctx.setProgram('facts', KNOWLEDGE, ['knowledge']);
    ctx.setProgram('ql', QL, ['queryLayer']);
    await ctx.commit();

    const qs = [
      'result(a).',
      'result(b). :- result(b).', // unsatisfiable under its own guard alone
      'result(a). result(b).',
    ];
    const busy = occupySlot(ctx);
    const [r0, r1, r2] = await Promise.all(
      qs.map((q) => ctx.solve(q, ['queryLayer'], { snapshot: true })),
    );
    await busy;

    expect(Math.max(...[r0, r1, r2].map((r) => r.stats.batchSize ?? 0))).toBe(
      3,
    );
    // Unlike the deleted renamed-and-bridged batch (where one instance's own
    // integrity constraint made the whole shared Control UNSAT, zeroing every
    // instance), only instance 1's own answer is empty.
    expect(r1.answers).toEqual([]);
    expect(r0.answers[0]).toContain('result(a)');
    expect(r0.answers[0]).not.toContain('result(b)');
    expect(r2.answers[0]).toContain('result(a)');
    expect(r2.answers[0]).toContain('result(b)');

    // Not poisoned in the cache either: a fresh solo solve of instance 0's own text
    // still hits the shared cache with its own genuine (non-empty) answer -- proof the
    // multiplexed group's per-instance results were each individually cached.
    const solo = await ctx.solve(qs[0], ['queryLayer'], { snapshot: true });
    expect(solo.stats.cacheHit).toBe(true);
    expect(solo.answers[0]).toContain('result(a)');
  });

  it('serves a mixed group with the right answers, in the order each promise was issued, and reports which were cache hits', async () => {
    clearCache();
    const ctx = new ClingoContext();
    ctx.setProgram('facts', KNOWLEDGE, ['knowledge']);
    ctx.setProgram('ql', QL, ['queryLayer']);
    await ctx.commit();

    const qs = ['result(a).', 'result(b).', 'result(a). result(b).'];
    // Pre-warms the shared cache for just the middle query via a plain, uncoalesced
    // solve() -- the same { snapshot: true } hash the multiplexed group below would
    // compute for that same query text.
    await ctx.solve(qs[1], ['queryLayer'], { snapshot: true });

    const busy = occupySlot(ctx);
    const results = await Promise.all(
      qs.map((q) => ctx.solve(q, ['queryLayer'], { snapshot: true })),
    );
    await busy;

    expect(results.map((r) => r.stats.cacheHit)).toEqual([false, true, false]);
    expect(results[0].answers[0]).toContain('result(a)');
    expect(results[0].answers[0]).not.toContain('result(b)');
    expect(results[1].answers[0]).toContain('result(b)');
    expect(results[2].answers[0]).toContain('result(a)');
    expect(results[2].answers[0]).toContain('result(b)');
    // The cache hit was served directly from ClingoContext::dispatchGroup()'s own
    // per-member cache lookup, before ever entering buildModels()/solveModels() --
    // batchSize 0, same as an uncoalesced cache hit reports (see Solve()'s own
    // cache-hit branch in binding.cc). The other two both went through the same
    // multiplexed solve as each other, so both report that solve's real size (2, not
    // 3 -- the cache hit was never a member of it).
    expect(results[1].stats.batchSize).toBe(0);
    expect(results[0].stats.batchSize).toBe(2);
    expect(results[2].stats.batchSize).toBe(2);
  });

  it('rejects only the query that fails to parse inside a coalesced group, and never caches an empty answer for it', async () => {
    clearCache();
    const ctx = new ClingoContext();
    ctx.setProgram('facts', KNOWLEDGE, ['knowledge']);
    ctx.setProgram('ql', QL, ['queryLayer']);
    await ctx.commit();

    const badQuery = 'result(a';
    const qs = ['result(a).', badQuery, 'result(b).'];
    const busy = occupySlot(ctx);
    const settled = await Promise.allSettled(
      qs.map((q) => ctx.solve(q, ['queryLayer'], { snapshot: true })),
    );
    await busy;

    expect(settled.map((s) => s.status)).toEqual([
      'fulfilled',
      'rejected',
      'fulfilled',
    ]);
    expect(
      settled[0].status === 'fulfilled' && settled[0].value.answers[0],
    ).toContain('result(a)');
    expect(
      settled[2].status === 'fulfilled' && settled[2].value.answers[0],
    ).toContain('result(b)');

    // Not a poisoned, empty-but-cached answer -- a fresh solve of the same bad text
    // still hits clingo's real parser and rejects again.
    await expect(
      ctx.solve(badQuery, ['queryLayer'], { snapshot: true }),
    ).rejects.toThrow();
  });

  it('isolates a #count aggregate per instance: each instance counts only its own guarded facts', async () => {
    clearCache();
    const ctx = new ClingoContext();
    ctx.setProgram('facts', `item(a). item(b). item(c).`, ['knowledge']);
    ctx.setProgram('ql', `#show total/1.`, ['queryLayer']);
    await ctx.commit();

    const qs = [
      'chosen(a). chosen(b). total(N) :- N = #count { X : chosen(X) }.',
      'chosen(a). total(N) :- N = #count { X : chosen(X) }.',
    ];
    const separate: ClingoResult[] = [];
    for (const q of qs) {
      separate.push(await ctx.solve(q, ['queryLayer'], { snapshot: true }));
    }

    clearCache();
    const busy = occupySlot(ctx);
    const multiplexed = await Promise.all(
      qs.map((q) => ctx.solve(q, ['queryLayer'], { snapshot: true })),
    );
    await busy;

    expect(
      Math.max(...multiplexed.map((r) => r.stats.batchSize ?? 0)),
    ).toBeGreaterThan(1);
    expect(multiplexed[0].answers[0]).toBe('total(2)');
    expect(multiplexed[1].answers[0]).toBe('total(1)');
    expect(multiplexed.map(norm)).toEqual(separate.map(norm));
  });
});

describe('models multiplexing over the real query layer', () => {
  // queries/card.lp and queries/tree.lp with their handlebars scaffolding resolved as if
  // rendered for cardKey "a" (tree.lp: recursive too) -- read from the real files so this
  // test tracks their source; `.replace()` on the exact current handlebars block is a
  // deliberately blunt tool here; if either file's templating ever changes shape, the
  // `{{`-check right after throws instead of silently comparing stale content.
  const pkgRoot = resolve(import.meta.dirname, '..');
  const queriesDir = resolve(
    pkgRoot,
    '..',
    'assets',
    'src',
    'calculations',
    'queries',
  );
  const assetsDir = resolve(
    pkgRoot,
    '..',
    'assets',
    'src',
    'calculations',
    'common',
  );
  const queryLayerSource =
    readFileSync(resolve(assetsDir, 'queryLanguage.lp'), 'utf8') +
    '\n' +
    readFileSync(resolve(assetsDir, 'utils.lp'), 'utf8');

  const cardQuery = readFileSync(
    resolve(queriesDir, 'card.lp'),
    'utf8',
  ).replace(
    `{{#if cardKey}}\nresult({{cardKey}}).\n{{else}}\nresult(X) :- projectCard(X).\n{{/if}}`,
    'result(a).',
  );
  const treeQuery = readFileSync(
    resolve(queriesDir, 'tree.lp'),
    'utf8',
  ).replace(
    `{{#if cardKey}}
result({{cardKey}}).
{{#if recursive}}
% child below
childResult({{cardKey}}, Card, "children") :- parent(Card, {{cardKey}}), not hiddenInTreeView(Card).
childResult(Parent, Card, "children") :- childResult(_, Parent, "children"), parent(Card, Parent), not hiddenInTreeView(Card).
{{/if}}

{{else}}
result(Card) :- projectCard(Card), not parent(Card, _), not hiddenInTreeView(Card).
childResult(Parent, Card, "children") :- card(Card), parent(Card, Parent), not hiddenInTreeView(Card).
{{/if}}`,
    `result(a).
childResult(a, Card, "children") :- parent(Card, a), not hiddenInTreeView(Card).
childResult(Parent, Card, "children") :- childResult(_, Parent, "children"), parent(Card, Parent), not hiddenInTreeView(Card).`,
  );
  if (cardQuery.includes('{{') || treeQuery.includes('{{')) {
    throw new Error(
      'queries/card.lp or queries/tree.lp handlebars changed shape -- update this fixture',
    );
  }

  // Deliberately exercises predicates the knowledge layer produces AND the query layer
  // (or a query itself) redefines: field/3 (queryLanguage.lp derives it from fields/5,7,9)
  // and dataType/3 (card.lp's own isCalculated rule derives it too), plus a link and a
  // policyCheckFailure/5 -- the exact shapes the renaming-based approach needed bridge
  // rules for. The models multiplexer needs none of that: every instance reads these
  // knowledge-derived predicates under their real names regardless.
  const KNOWLEDGE = `
card(a). card(b).
parent(b, a).
projectCard(a). projectCard(b).
field(a, "cardType", "task"). field(a, "title", "Card A").
field(b, "cardType", "task"). field(b, "title", "Card B").
field("task", "displayName", "Task").
field(a, "priority", "high").
dataType(a, "priority", "shortText").
customField("task", "priority").
alwaysVisibleField("task", "priority").
fieldType("priority").
link(a, b, "relates to").
policyCheckFailure(a, "naming", "Bad title", "Title too short", "title").
`;

  it('matches separate solves atom-for-atom -- set equality and counts alike -- for card.lp and tree.lp multiplexed together over a snapshot whose knowledge layer both queries also partly redefine', async () => {
    clearCache();
    const ctx = new ClingoContext();
    ctx.setProgram('facts', KNOWLEDGE, ['knowledge']);
    ctx.setProgram('ql', queryLayerSource, ['queryLayer']);
    await ctx.commit();

    const qs = [cardQuery, treeQuery];
    const separate: ClingoResult[] = [];
    for (const q of qs) {
      separate.push(await ctx.solve(q, ['queryLayer'], { snapshot: true }));
    }

    clearCache();
    const busy = occupySlot(ctx);
    const multiplexed = await Promise.all(
      qs.map((q) => ctx.solve(q, ['queryLayer'], { snapshot: true })),
    );
    await busy;

    expect(multiplexed.length).toBe(2);
    for (let i = 0; i < qs.length; i++) {
      const sep = norm(separate[i]);
      const mux = norm(multiplexed[i]);
      // Atom counts first: two equally-broken-but-equal sets would still pass a bare
      // set-equality check.
      expect(mux.length).toBe(sep.length);
      expect(mux).toEqual(sep);
    }
    // Sanity: both instances actually derive a non-trivial result, so the equality
    // check above cannot be passing because both sides are trivially empty.
    expect(norm(separate[0]).length).toBeGreaterThan(10);
    expect(norm(separate[1]).length).toBeGreaterThan(0);
    expect(Math.max(...multiplexed.map((r) => r.stats.batchSize ?? 0))).toBe(2);
  });
});
