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
import { describe, it, expect } from 'vitest';
import { ClingoContext, clearCache } from '../lib/index.js';

// vitest.coalesce.config.ts pins NODE_CLINGO_MAX_CONCURRENT=1, so the first solve()
// dispatches immediately and every solve() issued concurrently with it -- before that
// first one settles -- queues instead. That is what lets these tests deterministically
// exercise ClingoContext::pump() (src/binding.cc) rather than racing real hardware
// concurrency, which the rest of the suite runs under (see the main vitest.config.ts,
// which excludes this file).

describe('coalescing', () => {
  it('merges snapshot solves that queue behind busy workers', async () => {
    clearCache();
    const ctx = new ClingoContext();
    ctx.setProgram('facts', `card(a). card(b). card(c).`, ['knowledge']);
    ctx.setProgram('ql', `#show result/1.`, ['queryLayer']);
    await ctx.commit();
    const qs = [
      'result(a).',
      'result(b).',
      'result(c).',
      'result(K) :- card(K).',
    ];
    const results = await Promise.all(
      qs.map((q) => ctx.solve(q, ['queryLayer'], { snapshot: true })),
    );
    expect(results[0].answers[0]).toBe('result(a)');
    expect(results[3].answers[0].split('\n').sort()).toEqual([
      'result(a)',
      'result(b)',
      'result(c)',
    ]);
    const sizes = results.map((r) => r.stats.batchSize ?? 1);
    expect(Math.max(...sizes)).toBeGreaterThan(1); // the three that queued were solved together
  });

  it('gives coalesced results identical to solving the same queries one at a time, including two instances that redefine the same predicate with different extensions', async () => {
    clearCache();
    const ctx = new ClingoContext();
    ctx.setProgram('facts', `card(a). card(b).`, ['knowledge']);
    ctx.setProgram('ql', `#show result/1.`, ['queryLayer']);
    await ctx.commit();
    const qs = ['result(a).', 'result(b).', 'result(a). result(b).'];
    const norm = (r: { answers: string[] }) =>
      r.answers[0].split('\n').filter(Boolean).sort();

    // Sequential: each call is the only thing ever in flight, so none of these queue --
    // this is the "separate results" baseline.
    const separate = [];
    for (const q of qs) {
      separate.push(await ctx.solve(q, ['queryLayer'], { snapshot: true }));
    }

    clearCache();
    const coalesced = await Promise.all(
      qs.map((q) => ctx.solve(q, ['queryLayer'], { snapshot: true })),
    );

    coalesced.forEach((r, i) => expect(norm(r)).toEqual(norm(separate[i])));
    // Never let instance 0's or 1's own definition of `result` leak into the other.
    expect(coalesced[0].answers[0]).not.toContain('result(b)');
    expect(coalesced[1].answers[0]).not.toContain('result(a)');
    expect(
      Math.max(...coalesced.map((r) => r.stats.batchSize ?? 0)),
    ).toBeGreaterThan(1);
  });

  it('reports batchSize 1 for a group that reduces to a single real query, with the same answer every time', async () => {
    clearCache();
    const ctx = new ClingoContext();
    ctx.setProgram('facts', `card(a). card(b).`, ['knowledge']);
    ctx.setProgram('ql', `#show result/1.`, ['queryLayer']);
    await ctx.commit();

    // Nothing else is ever in flight here, so each of these dispatches immediately as a
    // group of one -- pump()'s plain (non-renamed) path, per dispatchGroup's doc comment
    // in binding.cc.
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

  it('serves a cache hit immediately even while a miss for a different query is still in flight', async () => {
    clearCache();
    const ctx = new ClingoContext();
    ctx.setProgram('facts', `card(a). card(b).`, ['knowledge']);
    ctx.setProgram('ql', `#show result/1.`, ['queryLayer']);
    await ctx.commit();

    // Warm the cache for 'result(b).' first, sequentially, so it is a hit below.
    await ctx.solve('result(b).', ['queryLayer'], { snapshot: true });

    const order: string[] = [];
    const miss = ctx
      .solve('result(a).', ['queryLayer'], { snapshot: true })
      .then((r) => {
        order.push('miss');
        return r;
      });
    // Issued while `miss` is still in flight (MAX_CONCURRENT=1): if this were also a
    // miss it would queue behind `miss` and only settle once `miss` frees the one
    // worker slot. Being a hit, it must resolve on its own, without waiting.
    const hit = ctx
      .solve('result(b).', ['queryLayer'], { snapshot: true })
      .then((r) => {
        order.push('hit');
        return r;
      });

    const hitResult = await hit;
    expect(hitResult.stats.cacheHit).toBe(true);
    expect(order).toEqual(['hit']); // resolved before `miss`, not merely before `miss` too
    await miss;
  });

  it('rejects only the query that fails to parse inside a coalesced group, leaving its siblings to settle normally, and never caches an empty answer for it', async () => {
    clearCache();
    const ctx = new ClingoContext();
    ctx.setProgram('facts', `card(a). card(b).`, ['knowledge']);
    ctx.setProgram('ql', `#show result/1.`, ['queryLayer']);
    await ctx.commit();

    const badQuery = 'result(a';
    const qs = ['result(a).', badQuery, 'result(b).'];
    const settled = await Promise.allSettled(
      qs.map((q) => ctx.solve(q, ['queryLayer'], { snapshot: true })),
    );

    expect(settled.map((s) => s.status)).toEqual([
      'fulfilled',
      'rejected',
      'fulfilled',
    ]);
    expect(
      settled[0].status === 'fulfilled' && settled[0].value.answers[0],
    ).toBe('result(a)');
    expect(
      settled[2].status === 'fulfilled' && settled[2].value.answers[0],
    ).toBe('result(b)');

    // Not a poisoned, empty-but-cached answer -- a fresh solve of the same bad text
    // still hits clingo's real parser and rejects again.
    await expect(
      ctx.solve(badQuery, ['queryLayer'], { snapshot: true }),
    ).rejects.toThrow();
  });

  it('settles every queued promise, without hanging, when the snapshot goes stale while they wait', async () => {
    clearCache();
    const ctx = new ClingoContext();
    ctx.setProgram('facts', `card(a). card(b).`, ['knowledge']);
    ctx.setProgram('ql', `#show result/1.`, ['queryLayer']);
    await ctx.commit();

    // Occupies the one worker slot so the next two calls are guaranteed to queue
    // rather than dispatch immediately.
    const busy = ctx.solve('result(a).', ['queryLayer'], { snapshot: true });
    const queued = [
      ctx.solve('result(b).', ['queryLayer'], { snapshot: true }),
      ctx.solve('result(a). result(b).', ['queryLayer'], { snapshot: true }),
    ];

    // The knowledge layer changes -- and is never re-committed -- while `queued` sits
    // in the pump's queue, still pointing at the now-superseded snapshot.
    ctx.setProgram('facts', `card(a). card(b). card(c).`, ['knowledge']);

    await expect(busy).resolves.toBeDefined();
    const settled = await Promise.allSettled(queued);
    // Rejecting -- rather than silently solving against the stale snapshot, or
    // against knowledge content the caller never committed -- matches what a fresh
    // solve({ snapshot: true }) call would do at this same instant (see
    // snapshot.test.ts's own "rejects with SNAPSHOT_STALE" test): the pump must not
    // give a queued request a different freshness guarantee than an uncoalesced one.
    expect(settled.every((s) => s.status === 'rejected')).toBe(true);
    for (const s of settled) {
      expect(s.status === 'rejected' && s.reason).toMatchObject({
        code: 'SNAPSHOT_STALE',
      });
    }
  });
});
