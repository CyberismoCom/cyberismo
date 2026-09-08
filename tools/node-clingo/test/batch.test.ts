import { describe, it, expect } from 'vitest';
import { _renameForTest } from '../lib/index.js';

// Gated by NODE_CLINGO_TEST_EXPORTS (see vitest.config.ts); undefined in a normal build.
const rename = _renameForTest!;

describe('rename_predicates', () => {
  it('prefixes every predicate defined in the program, including pools and #show terms', () => {
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

  it('renames a defined predicate inside a body conditional literal, leaving its condition alone', () => {
    const out = rename(`sel(1). sel(2). ok :- sel(X) : card(X).`, 'q1_');
    expect(out).toContain('q1_sel(1).');
    expect(out).toContain('q1_sel(2).');
    expect(out).toContain('q1_ok :- q1_sel(X): card(X).');
  });

  it("treats a head aggregate element's own literal as defined, but not its condition", () => {
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
});
