import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

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
