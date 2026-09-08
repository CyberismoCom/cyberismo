import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { ClingoContext, clearCache } from '../lib/index.js';

// `_renameForTest` is deliberately not part of lib/index.ts's public surface (see
// binding.cc's Init(): it is a runtime-only debug export, gated on
// NODE_CLINGO_TEST_EXPORTS). This loads the built addon directly, mirroring how
// lib/index.ts resolves its own `localBinary`, so the test can reach it without shipping
// it in the package's TypeScript API.
const require = createRequire(import.meta.url);
const pkgRoot = resolve(import.meta.dirname, '..');
const localBinary = resolve(pkgRoot, 'build', 'Release', 'node-clingo.node');

interface RenameForTestResult {
  renamed: string;
  original: string;
}

interface NativeTestBinding {
  _renameForTest?(program: string, prefix: string): RenameForTestResult;
}

const native = require(localBinary) as NativeTestBinding;
const renameForTest = native._renameForTest!;
const rename = (program: string, prefix: string) =>
  renameForTest(program, prefix).renamed;

describe('rename_predicates', () => {
  it('prefixes every predicate defined in the program, including one with a pooled argument, and #show terms', () => {
    // `select("a";"b")` is a Function with a *pooled argument* (arity 1), not a Pool atom
    // -- ordinary clingo syntax never produces a Pool directly as a symbolic atom's own
    // term (a top-level `;` between whole atoms parses as Disjunction instead), so this
    // does not exercise rename_predicates' Pool branches; it exercises the ordinary
    // Function path once more, on an atom with a pooled argument.
    const out = rename(
      `result(K) :- want(K). select("a";"b"). want(x). #show result/1. #show sel(F) : select(F).`,
      'q1_',
    );
    expect(out).toContain('q1_result(K) :- q1_want(K).');
    expect(out).toContain('q1_select("a";"b").');
    expect(out).toContain('#show q1_result/1.');
    expect(out).toContain('#show q1_sel(F) : q1_select(F).');
  });

  it('leaves predicates it does not define untouched', () => {
    const out = rename(`result(K) :- card(K), field(K, "title", _).`, 'q1_');
    // clingo's own printer joins body literals with "; " and drops spaces inside
    // argument lists -- this asserts the actual printed form, not the plan's guess.
    expect(out).toContain('q1_result(K) :- card(K); field(K,"title",_).');
  });

  it("never renames a Function nested inside another term's arguments, even nested in a tuple, though the same name is genuinely defined elsewhere", () => {
    const out = rename(`c. childObject(c, (c, "x"), y) :- c.`, 'q1_');
    // `c` is a real defined 0-ary predicate: both real uses (the fact, and the body
    // literal) are renamed. The two `c`s inside childObject's arguments -- one bare, one
    // nested inside a tuple -- are plain data and must survive unrenamed.
    expect(out).toContain('q1_c.');
    expect(out).toContain('q1_childObject(c,(c,"x"),y) :- q1_c.');
  });

  it('renames a 0-arity constant defined as a fact', () => {
    // A bare identifier parses as a SymbolicTerm holding a Function symbol, not as a
    // Function node -- head_signatures and the renamer both need the SymbolicTerm case.
    const out = rename(`selectAll. x :- selectAll.`, 'q1_');
    expect(out).toContain('q1_selectAll.');
    expect(out).toContain('q1_x :- q1_selectAll.');
  });

  it('renames a defined predicate used inside a body aggregate element condition', () => {
    const out = rename(
      `sel(X) :- card(X). n(N) :- N = #count { K : card(K), sel(K) }.`,
      'q1_',
    );
    expect(out).toContain('q1_sel(X) :- card(X).');
    expect(out).toContain('q1_n(N) :- N = #count { K: card(K), q1_sel(K) }.');
  });

  it('renames every defined predicate inside a body conditional literal, its own literal and its condition alike', () => {
    // `card` is defined here too (unlike an earlier draft of this fixture): renaming does
    // not treat a conditional literal's own literal and its condition any differently --
    // that asymmetry belongs to signature collection (head_signatures), not to this step.
    const out = rename(
      `sel(1). sel(2). card(1). card(2). ok :- sel(X) : card(X).`,
      'q1_',
    );
    expect(out).toContain('q1_sel(1).');
    expect(out).toContain('q1_sel(2).');
    expect(out).toContain('q1_card(1).');
    expect(out).toContain('q1_card(2).');
    expect(out).toContain('q1_ok :- q1_sel(X): q1_card(X).');
  });

  it("counts a head aggregate element's own literal as a defined signature, but not its bare condition (a head_signatures distinction, not a renaming one)", () => {
    // `item` is never independently defined here, so it correctly stays out of sigs and
    // untouched -- this pins head_signatures' HeadAggregate handling. It is not a claim
    // that renaming itself would skip `item` if it were defined; see the conditional
    // literal test above for that same head/condition distinction made explicit.
    const out = rename(`1 <= #count { X : chosen(X) : item(X) } <= 2.`, 'q1_');
    expect(out).toContain('1 <= #count { X: q1_chosen(X): item(X) } <= 2.');
  });

  it('leaves a classically negated head untouched even when the plain predicate is defined', () => {
    // Matches the Python oracle (qtools/lpast.py term_sigs): only Pool/Function/
    // SymbolicTerm are predicate uses, so a strongly-negated atom is never renamed --
    // a known, deliberately-mirrored gap, not a bug.
    const out = rename(`p(X) :- r(X). -p(X) :- s(X). r(1). s(1).`, 'q1_');
    expect(out).toContain('q1_p(X) :- q1_r(X).');
    expect(out).toContain('-p(X) :- q1_s(X).');
  });

  it('does not treat a #show as a definition: body uses of a shown-but-underived predicate stay unrenamed', () => {
    // A #show declares an output name, it does not define a predicate (qtools/lpast.py
    // classify() gives show/showsig no heads). The shown term is prefixed unconditionally,
    // but `dataType/3` is derived by the knowledge layer, so a body use of it must keep the
    // shared name: renaming it would reference an atom no instance derives, and the rule
    // would silently match nothing.
    const out = rename(
      `listField(K,F,V) :- field(K,F,V), dataType(K,F,"list").
       #show dataType(K,F,D) : dataType(K,F,D).`,
      'q1_',
    );
    expect(out).toContain(
      'q1_listField(K,F,V) :- field(K,F,V); dataType(K,F,"list").',
    );
    expect(out).toContain('#show q1_dataType(K,F,D) : dataType(K,F,D).');
  });

  it('never mutates the parsed input -- the printed original is unrenamed', () => {
    const program = `result(x). #show sel(F) : select(F). select(x).`;
    const out = renameForTest(program, 'q1_');
    expect(out.renamed).toContain('q1_result(x).');
    expect(out.renamed).toContain('#show q1_sel(F) : q1_select(F).');
    expect(out.original).not.toContain('q1_');
    expect(out.original).toContain('result(x).');
    expect(out.original).toContain('#show sel(F) : select(F).');
    expect(out.original).toContain('select(x).');
  });
});

describe('rename_predicates over the real query layer', () => {
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

  it('matches a golden rename of queryLanguage.lp + utils.lp, verified against the Python oracle', () => {
    // Golden fixture generated from rename_predicates(head_signatures(nodes), 'q1_') on
    // the real Cyberismo query language + utils sources (195 statements, 20 defined
    // signatures at the time this was generated) and cross-checked byte-for-byte against
    // an independent Python implementation of the same semantics (qtools/lpast.py's
    // head_sigs restricted to Rule statements, and Renamer(mapping, show_prefix=prefix))
    // on clingo 5.8.2. This is exactly Task 4's input shape, so a mismatch here is a real
    // regression, not noise -- regenerate the fixture (feed the same two files through
    // _renameForTest(text, 'q1_') and save `.renamed`) only after confirming a diff is an
    // intended behaviour change, ideally re-verified against the oracle.
    const golden = readFileSync(
      resolve(import.meta.dirname, 'fixtures', 'query-layer-renamed.q1_.lp'),
      'utf8',
    );
    expect(rename(queryLayerSource, 'q1_')).toBe(golden);
  });

  it('prefixing is exactly the unprefixed baseline with the prefix stripped back out', () => {
    // rename(src, '') is a verified no-op prefix, giving a printer-normalised baseline for
    // free. This catches any name mangled other than by prefixing, any statement dropped
    // or reordered, and any renamed occurrence whose original didn't survive -- it cannot
    // catch under-renaming (a signature that should have been in `sigs` but wasn't, e.g.
    // this fix's own bug), which is what the golden file above is for.
    const base = rename(queryLayerSource, '');
    const prefixed = rename(queryLayerSource, 'q0_');
    expect(
      prefixed.split('\n').map((line) => line.replaceAll('q0_', '')),
    ).toEqual(base.split('\n'));
  });
});

describe('solveBatch over the real query layer', () => {
  // queries/card.lp and queries/tree.lp with their handlebars scaffolding resolved as if
  // rendered for cardKey "a" (tree.lp: recursive too) -- read from the real files so this
  // test tracks their source; `.replace()` on the exact current handlebars block is a
  // deliberately blunt tool here; if either file's templating ever changes shape, the
  // `{{`-check right after throws instead of silently comparing stale content.
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
  // policyCheckFailure/5 -- the exact shapes C1 found losing atoms when batched unbridged.
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

  const norm = (r: { answers: string[] }) =>
    r.answers[0].split('\n').filter(Boolean).sort();

  it('matches separate solves atom-for-atom -- set equality and count alike -- for card.lp and tree.lp batched together over a snapshot', async () => {
    clearCache();
    const ctx = new ClingoContext();
    ctx.setProgram('facts', KNOWLEDGE, ['knowledge']);
    ctx.setProgram('ql', queryLayerSource, ['queryLayer']);
    await ctx.commit();

    const qs = [cardQuery, treeQuery];
    const separate = await Promise.all(
      qs.map((q) => ctx.solve(q, ['queryLayer'], { snapshot: true })),
    );
    clearCache();
    const batched = await ctx.solveBatch(qs, ['queryLayer'], {
      snapshot: true,
    });

    expect(batched.length).toBe(2);
    for (let i = 0; i < qs.length; i++) {
      const sep = norm(separate[i]);
      const bat = norm(batched[i]);
      // Atom counts first: two equal-but-both-wrong sets (both silently missing the
      // same atoms) would still pass a bare set-equality check.
      expect(bat.length).toBe(sep.length);
      expect(bat).toEqual(sep);
    }
    // Every atom an instance emits is prefixed with its own name; nothing should
    // fall through as an unmatched atom broadcast to all instances. A non-zero count
    // here means the query layer emits something the renamer did not claim.
    expect(batched.every((r) => r.stats.unprefixedAtoms === 0)).toBe(true);
    // Sanity: both instances actually derive a non-trivial result, so the equality
    // check above cannot be passing because both sides are trivially empty.
    expect(norm(separate[0]).length).toBeGreaterThan(10);
    expect(norm(separate[1]).length).toBeGreaterThan(0);
  });
});

describe('solveBatch', () => {
  const KNOWLEDGE = `card(a). card(b). field(a,"title","A"). field(b,"title","B").`;
  const QL = `#show result/1. #show field(K,F,V) : result(K), field(K,F,V). #show childResult/3.`;

  const norm = (r: { answers: string[] }) =>
    r.answers[0].split('\n').filter(Boolean).sort();

  it('returns per-query answers identical to separate solves', async () => {
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
    const separate = await Promise.all(
      qs.map((q) => ctx.solve(q, ['queryLayer'], { snapshot: true })),
    );
    clearCache();
    const batched = await ctx.solveBatch(qs, ['queryLayer'], {
      snapshot: true,
    });
    expect(batched.length).toBe(3);
    batched.forEach((b, i) => expect(norm(b)).toEqual(norm(separate[i])));
    expect(batched[0].stats.batchSize).toBe(3);
  });

  it("never lets two instances defining the same predicate with different extensions see each other's atoms", async () => {
    clearCache();
    const ctx = new ClingoContext();
    ctx.setProgram('facts', KNOWLEDGE, ['knowledge']);
    ctx.setProgram('ql', QL, ['queryLayer']);
    await ctx.commit();
    const batched = await ctx.solveBatch(
      ['result(a).', 'result(b).'],
      ['queryLayer'],
      { snapshot: true },
    );
    expect(batched[0].answers[0]).toContain('result(a)');
    expect(batched[0].answers[0]).not.toContain('result(b)');
    expect(batched[1].answers[0]).toContain('result(b)');
    expect(batched[1].answers[0]).not.toContain('result(a)');
  });

  it('serves a mixed batch with the right answers, in order, and reports which were cache hits', async () => {
    clearCache();
    const ctx = new ClingoContext();
    ctx.setProgram('facts', KNOWLEDGE, ['knowledge']);
    ctx.setProgram('ql', QL, ['queryLayer']);
    await ctx.commit();
    const qs = ['result(a).', 'result(b).', 'result(a). result(b).'];
    // Pre-warms the cache for just the middle query via a plain solve() -- the same
    // { snapshot: true } hash solveBatch() would compute for that instance.
    await ctx.solve(qs[1], ['queryLayer'], { snapshot: true });
    const batched = await ctx.solveBatch(qs, ['queryLayer'], {
      snapshot: true,
    });
    expect(batched.map((r) => r.stats.cacheHit)).toEqual([false, true, false]);
    expect(batched[0].answers[0]).toContain('result(a)');
    expect(batched[0].answers[0]).not.toContain('result(b)');
    expect(batched[1].answers[0]).toContain('result(b)');
    expect(batched[2].answers[0]).toContain('result(a)');
    expect(batched[2].answers[0]).toContain('result(b)');
    expect(batched.every((r) => r.stats.batchSize === 3)).toBe(true);
  });

  it('behaves like a plain snapshot solve for a batch of one', async () => {
    clearCache();
    const ctx = new ClingoContext();
    ctx.setProgram('facts', KNOWLEDGE, ['knowledge']);
    ctx.setProgram('ql', QL, ['queryLayer']);
    await ctx.commit();
    const q = 'result(a).';
    const solo = await ctx.solve(q, ['queryLayer'], { snapshot: true });
    clearCache();
    const [batched] = await ctx.solveBatch([q], ['queryLayer'], {
      snapshot: true,
    });
    expect(norm(batched)).toEqual(norm(solo));
    expect(batched.stats.batchSize).toBe(1);
  });

  it('round-trips a nested tuple in a shown atom identically to a single solve', async () => {
    clearCache();
    const ctx = new ClingoContext();
    ctx.setProgram('facts', KNOWLEDGE, ['knowledge']);
    ctx.setProgram(
      'ql',
      `#show childObject(K, (K, "x"), y) : result(K).\n${QL}`,
      ['queryLayer'],
    );
    await ctx.commit();
    const q = 'result(a).';
    const solo = await ctx.solve(q, ['queryLayer'], { snapshot: true });
    clearCache();
    const [batched] = await ctx.solveBatch([q], ['queryLayer'], {
      snapshot: true,
    });
    expect(norm(batched)).toEqual(norm(solo));
    // Only the outer predicate name is ever prefixed/stripped -- the tuple argument
    // (K, "x") is data, so `K`'s value (`a`) inside it must survive untouched.
    expect(solo.answers[0]).toContain('(a,"x")');
    expect(batched.answers[0]).toContain('(a,"x")');
  });

  it("returns an empty answer for an instance that derives nothing, without disturbing its neighbours' indexing", async () => {
    clearCache();
    const ctx = new ClingoContext();
    ctx.setProgram('facts', KNOWLEDGE, ['knowledge']);
    ctx.setProgram('ql', QL, ['queryLayer']);
    await ctx.commit();
    const qs = ['result(a).', '', 'result(b).'];
    const batched = await ctx.solveBatch(qs, ['queryLayer'], {
      snapshot: true,
    });
    expect(batched.length).toBe(3);
    expect(batched[0].answers[0]).toContain('result(a)');
    expect(batched[1].answers[0]).toBe('');
    expect(batched[2].answers[0]).toContain('result(b)');
  });

  it('rejects a batch containing a query that fails to parse, and a later plain solve() of that same text still rejects rather than resolving a poisoned cache entry', async () => {
    clearCache();
    const ctx = new ClingoContext();
    ctx.setProgram('facts', KNOWLEDGE, ['knowledge']);
    ctx.setProgram('ql', QL, ['queryLayer']);
    await ctx.commit();
    const badQuery = 'result(a';

    await expect(
      ctx.solveBatch([badQuery, 'result(b).'], ['queryLayer'], {
        snapshot: true,
      }),
    ).rejects.toThrow();

    // The batch rejection must not have inserted an empty answer into the shared cache
    // under badQuery's own hash -- a plain solve() of the same text has to hit clingo's
    // real parser again and reject with a real syntax error, not resolve `['']` from
    // cache.
    await expect(
      ctx.solve(badQuery, ['queryLayer'], { snapshot: true }),
    ).rejects.toThrow();
  });

  it('rejects a batch containing a stored query-layer program that never parsed, instead of silently contributing nothing', async () => {
    clearCache();
    const ctx = new ClingoContext();
    ctx.setProgram('facts', KNOWLEDGE, ['knowledge']);
    // Broken query-layer program: setProgram() stores it with empty ast_nodes (its
    // text-fallback path), same as it would for any other unparseable content.
    ctx.setProgram('broken', 'result(a', ['queryLayer']);
    await ctx.commit();

    await expect(
      ctx.solveBatch(['result(a).'], ['queryLayer'], { snapshot: true }),
    ).rejects.toThrow();
  });

  it("never serves another call's batchSize or unprefixedAtoms from the cache: a plain solve() and a differently-sized solveBatch() of the same query each report their own call's values", async () => {
    const KNOWLEDGE_BROADCAST = `card(a). card(b).`;
    // Neither instance renames `card` (nothing defines it), so both knowledge atoms are
    // broadcast, unmatched, on every batch call that grounds this query layer.
    const QL_BROADCAST = `#show card/1.`;

    clearCache();
    const ctx = new ClingoContext();
    ctx.setProgram('facts', KNOWLEDGE_BROADCAST, ['knowledge']);
    ctx.setProgram('ql', QL_BROADCAST, ['queryLayer']);
    await ctx.commit();

    const batched = await ctx.solveBatch(
      ['result(a).', 'result(a).'],
      ['queryLayer'],
      { snapshot: true },
    );
    expect(batched[0].stats.batchSize).toBe(2);
    expect(batched[0].stats.unprefixedAtoms).toBe(2);

    // Same query text as instance 0 above -- now served from the cache that batch call
    // populated.
    const solo = await ctx.solve('result(a).', ['queryLayer'], {
      snapshot: true,
    });
    expect(solo.stats.cacheHit).toBe(true);
    expect(solo.stats.batchSize).toBe(0);
    expect(solo.stats.unprefixedAtoms).toBe(0);

    const rebatched = await ctx.solveBatch(['result(a).'], ['queryLayer'], {
      snapshot: true,
    });
    expect(rebatched[0].stats.cacheHit).toBe(true);
    expect(rebatched[0].stats.batchSize).toBe(1);
    expect(rebatched[0].stats.unprefixedAtoms).toBe(0);
  });

  it('one individually-unsatisfiable instance makes the whole batch UNSAT, yields answers: [] for every instance, and does not poison the cache', async () => {
    clearCache();
    const ctx = new ClingoContext();
    ctx.setProgram('facts', KNOWLEDGE, ['knowledge']);
    ctx.setProgram('ql', QL, ['queryLayer']);
    await ctx.commit();
    const qs = [
      'result(a).',
      'result(b). :- result(b).',
      'result(a). result(b).',
    ];
    const batched = await ctx.solveBatch(qs, ['queryLayer'], {
      snapshot: true,
    });
    batched.forEach((r) => expect(r.answers).toEqual([]));

    // Instance 0 would be satisfiable alone; the batch-wide UNSAT must not have cached
    // that empty answer under its hash.
    const solo = await ctx.solve(qs[0], ['queryLayer'], { snapshot: true });
    expect(solo.stats.cacheHit).toBe(false);
    expect(solo.answers[0]).toContain('result(a)');
  });

  it('demangles a bare-tuple #show term (a Function whose own name is "") instead of broadcasting it verbatim as "q<i>_(...)"', async () => {
    const KNOWLEDGE_TUPLES = `e(1,2). e(3,4).`;
    const QL_TUPLES = `#show (X,Y) : e(X,Y).`;

    clearCache();
    const ctx = new ClingoContext();
    ctx.setProgram('facts', KNOWLEDGE_TUPLES, ['knowledge']);
    ctx.setProgram('ql', QL_TUPLES, ['queryLayer']);
    await ctx.commit();
    const qs = ['result(a).', 'result(b).'];
    const separate = await Promise.all(
      qs.map((q) => ctx.solve(q, ['queryLayer'], { snapshot: true })),
    );
    clearCache();
    const batched = await ctx.solveBatch(qs, ['queryLayer'], {
      snapshot: true,
    });
    batched.forEach((b, i) => expect(norm(b)).toEqual(norm(separate[i])));
    expect(batched[0].answers[0]).toContain('(1,2)');
    expect(batched[0].answers[0]).not.toContain('q0_');
    expect(batched[0].answers[0]).not.toContain('q1_');
  });

  it('broadcasts a shown non-Function term (a bare value, not a predicate application) instead of silently dropping it, and counts it', async () => {
    const KNOWLEDGE_BARE = `p("s"). p(1).`;
    const QL_BARE = `#show X : p(X).`;

    clearCache();
    const ctx = new ClingoContext();
    ctx.setProgram('facts', KNOWLEDGE_BARE, ['knowledge']);
    ctx.setProgram('ql', QL_BARE, ['queryLayer']);
    await ctx.commit();
    const qs = ['result(a).', 'result(b).'];
    const separate = await Promise.all(
      qs.map((q) => ctx.solve(q, ['queryLayer'], { snapshot: true })),
    );
    clearCache();
    const batched = await ctx.solveBatch(qs, ['queryLayer'], {
      snapshot: true,
    });
    batched.forEach((b, i) => expect(norm(b)).toEqual(norm(separate[i])));
    expect(norm(batched[0])).toContain('"s"');
    expect(norm(batched[0])).toContain('1');
    expect(batched[0].stats.unprefixedAtoms).toBeGreaterThanOrEqual(4);
  });
});
