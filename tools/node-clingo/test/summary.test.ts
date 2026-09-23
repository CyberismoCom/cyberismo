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
import { describe, expect, it } from 'vitest';
import { ClingoError, parseSummary } from '../lib/index.js';

function expectSummary(program: string, heads: string[], bodies: string[]) {
  expect(parseSummary(program)).toEqual({ heads, bodies });
}

describe('parseSummary', () => {
  it('reads facts', () => {
    expectSummary('a. b(1). c(1, "x").', ['a/0', 'b/1', 'c/2'], []);
  });

  it('reads rules with positive and negative bodies', () => {
    expectSummary(
      'p(X) :- q(X), not r(X), not not s(X).',
      ['p/1'],
      ['q/1', 'r/1', 's/1'],
    );
  });

  it('reads constraints as bodies only', () => {
    expectSummary(':- a, not b.', [], ['a/0', 'b/0']);
    expectSummary('#false :- c.', [], ['c/0']);
  });

  it('reads choice rules with conditions', () => {
    expectSummary('{ p(X) : q(X) } :- r.', ['p/1'], ['q/1', 'r/0']);
  });

  it('reads bounded choice rules', () => {
    expectSummary('1 { p; q } 2 :- r.', ['p/0', 'q/0'], ['r/0']);
  });

  it('reads disjunctions', () => {
    expectSummary('a ; b : c :- d.', ['a/0', 'b/0'], ['c/0', 'd/0']);
  });

  it('reads head aggregates', () => {
    expectSummary(
      '#sum { 1, X : p(X) : q(X) ; 2 : r } :- s.',
      ['p/1', 'r/0'],
      ['q/1', 's/0'],
    );
  });

  it('reads pools of equal and different arity', () => {
    expectSummary('p(1;2). q(1,2;3).', ['p/1', 'q/1', 'q/2'], []);
  });

  it('reads body aggregates, ignoring the aggregate terms', () => {
    expectSummary(
      'a :- #count { X, t(X) : p(X), not q(X) } > 1.',
      ['a/0'],
      ['p/1', 'q/1'],
    );
  });

  it('reads body set aggregates', () => {
    expectSummary('a :- { p(X) : q(X) } > 1.', ['a/0'], ['p/1', 'q/1']);
  });

  it('reads conditional literals', () => {
    expectSummary('a :- p(X) : q(X).', ['a/0'], ['p/1', 'q/1']);
  });

  it('reads #show terms and signatures as bodies', () => {
    expectSummary('#show s(X) : t(X). #show u/2.', [], ['t/1', 'u/2']);
  });

  it('reads comparisons as nothing', () => {
    expectSummary('a(X) :- X = 1..3, X != 2.', ['a/1'], []);
  });

  it('reads #const and #program as nothing', () => {
    expectSummary('#const n = 1. #program base.', [], []);
  });

  it('reads an empty program', () => {
    expectSummary('% nothing', [], []);
  });

  // The cases below diverge from lpast on purpose.

  it('reads a default-negated head as a body', () => {
    // lpast: heads k/0, m/0. `not k :- l.` means `:- l, k.`, a read.
    expectSummary(
      'not k :- l. not not m :- n.',
      [],
      ['k/0', 'l/0', 'm/0', 'n/0'],
    );
    // lpast: heads a/0, b/0.
    expectSummary('{ a ; not b }.', ['a/0'], ['b/0']);
  });

  it('reads classical negation in heads, bodies and #show', () => {
    // lpast: drops -p/1 and -c/0, and reports p/1 for the #show.
    expectSummary(
      '-p(X) :- q(X), not -c. #show -p/1.',
      ['-p/1'],
      ['-c/0', '-p/1', 'q/1'],
    );
  });

  it('reads the bodies of #minimize and weak constraints', () => {
    // lpast: nothing.
    expectSummary('#minimize { 1, X : p(X) }. :~ q. [1]', [], ['p/1', 'q/0']);
  });

  it('reads the condition of #external, never its atom', () => {
    // lpast: nothing.
    expectSummary('#external e(X) : f(X).', [], ['f/1']);
  });

  it('reads the bodies of #heuristic, #edge and #project', () => {
    // lpast: nothing.
    expectSummary(
      '#heuristic h : i. [1, true] #edge (1, 2) : j. #project k : l.',
      [],
      ['i/0', 'j/0', 'l/0'],
    );
  });

  it('throws ClingoError on a syntax error', () => {
    let error: unknown;
    try {
      parseSummary('fact(1');
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ClingoError);
    const { details, message } = error as ClingoError;
    expect(details.errors.length).toBeGreaterThan(0);
    expect(message).toContain('syntax error');
  });
});
