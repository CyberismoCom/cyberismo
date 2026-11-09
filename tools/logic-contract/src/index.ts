// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { afterEach, describe, expect, it } from 'vitest';
import {
  LogicError,
  type Diagnostic,
  type LogicBackend,
  type LogicQueryResult,
  type Program,
} from '@cyberismo/data-handler';

// Leaves the programs without a total answer while p(1) holds: no answer set
// for clingo, an undefined atom for a well-founded backend. The suite uses no
// integrity constraints, which not every backend accepts.
const UNDEFINED_WITH_P1 = 'undefined :- not undefined, p(1).';

const knowledge = (key: string, text: string): Program => ({
  key,
  role: 'knowledge',
  text,
});

// The shown atoms of a result, sorted.
const atoms = (result: LogicQueryResult) =>
  result.answers
    .flatMap((answer) => answer.split('\n'))
    .filter((atom) => atom.trim() !== '')
    .sort();

const errorsOf = (diagnostics: Diagnostic[]) =>
  diagnostics.filter((diagnostic) => diagnostic.severity === 'error');

const failure = (call: Promise<unknown>) =>
  call.then(
    () => undefined,
    (error: unknown) => error,
  );

/**
 * The contract of the `LogicBackend` port as a vitest suite: what the
 * checkout relies on, and nothing a backend may do differently. `create`
 * makes a fresh backend for each test; the suite closes it.
 */
export function describeLogicBackendContract(
  name: string,
  create: () => LogicBackend | Promise<LogicBackend>,
) {
  describe(`logic backend contract: ${name}`, () => {
    let backend: LogicBackend | undefined;

    afterEach(async () => {
      await backend?.close();
      backend = undefined;
    });

    // A fresh backend holding `programs`, committed as a rebuild is.
    async function holding(programs: Program[] = []) {
      backend = await create();
      const tx = await backend.begin();
      tx.replaceAll(programs);
      await tx.commit({ keepNonTotal: true });
      return backend;
    }

    const show = async (logic: LogicBackend) =>
      atoms(await logic.query('#show p/1.'));

    it('answers queries over the committed programs, query programs included', async () => {
      const logic = await holding([
        knowledge('p', 'p(1).'),
        { key: 'rules', role: 'query', text: 'q(X) :- p(X).' },
      ]);
      expect(atoms(await logic.query('#show q/1.'))).toEqual(['q(1)']);
    });

    it('shows a transaction its changes, and later reads the commit', async () => {
      const logic = await holding([
        knowledge('p', 'p(1).'),
        knowledge('q', 'p(2).'),
      ]);
      const tx = await logic.begin();
      tx.set([knowledge('p', 'p(3).'), knowledge('r', 'p(4).')]);
      tx.remove(['q', 'unknown']);
      expect(atoms(await tx.query('#show p/1.'))).toEqual(['p(3)', 'p(4)']);
      await tx.commit();
      expect(await show(logic)).toEqual(['p(3)', 'p(4)']);
    });

    it('replaces every program with replaceAll, also after an abort', async () => {
      const logic = await holding([knowledge('p', 'p(1).')]);
      const aborted = await logic.begin();
      aborted.set([knowledge('q', 'p(2).')]);
      await aborted.abort();
      const tx = await logic.begin();
      tx.replaceAll([knowledge('r', 'p(5).')]);
      await tx.commit();
      expect(await show(logic)).toEqual(['p(5)']);
    });

    it('leaves the committed programs as they were after an abort', async () => {
      const logic = await holding([
        knowledge('p', 'p(1).'),
        knowledge('q', 'p(2).'),
      ]);
      const tx = await logic.begin();
      tx.set([knowledge('p', 'p(3).'), knowledge('r', 'p(4).')]);
      tx.remove(['q']);
      expect(atoms(await tx.query('#show p/1.'))).toEqual(['p(3)', 'p(4)']);
      tx.replaceAll([knowledge('s', 'p(5).')]);
      await tx.abort();
      expect(await show(logic)).toEqual(['p(1)', 'p(2)']);
    });

    it('leaves the committed programs as they were after a refused commit', async () => {
      const logic = await holding([knowledge('p', 'p(1).')]);
      const tx = await logic.begin();
      tx.set([knowledge('q', 'p(2).')]);
      expect(atoms(await tx.query('#show p/1.'))).toEqual(['p(1)', 'p(2)']);
      tx.set([knowledge('u', UNDEFINED_WITH_P1)]);
      const refused = await failure(tx.commit());
      // A backend may keep a result without a total answer; then there is
      // nothing to check.
      if (refused === undefined) return;
      expect(refused).toBeInstanceOf(LogicError);
      expect(await show(logic)).toEqual(['p(1)']);
    });

    it('opens one transaction at a time, and refuses one that has ended', async () => {
      const logic = await holding();
      const tx = await logic.begin();
      expect(await failure(logic.begin())).toBeInstanceOf(LogicError);
      await tx.commit();
      expect(await failure(tx.commit())).toBeInstanceOf(LogicError);
      await (await logic.begin()).abort();
    });

    it('keeps a transaction open after a failed query in it', async () => {
      const logic = await holding([knowledge('p', 'p(1).')]);
      const tx = await logic.begin();
      tx.set([knowledge('q', 'p(2).')]);
      expect(await failure(tx.query('result(X :- '))).toBeInstanceOf(
        LogicError,
      );
      await tx.commit();
      expect(await show(logic)).toEqual(['p(1)', 'p(2)']);
    });

    it('fails a query that does not parse as invalid, with diagnostics', async () => {
      const logic = await holding([knowledge('p', 'p(1).')]);
      const error = await failure(logic.query('result(X :- '));
      expect(error).toBeInstanceOf(LogicError);
      expect((error as LogicError).kind).toBe('invalid');
      expect(errorsOf((error as LogicError).diagnostics)).not.toEqual([]);
    });

    it('answers no answer, or nonTotal, for programs kept without a total answer', async () => {
      const logic = await holding([
        knowledge('p', `p(1). ${UNDEFINED_WITH_P1}`),
      ]);
      const answer = await logic.query('#show p/1.').catch((e: unknown) => e);
      if (answer instanceof LogicError) {
        expect(answer.kind).toBe('nonTotal');
      } else {
        expect((answer as LogicQueryResult).answers).toEqual([]);
      }
    });

    it('checks each program on its own, naming its key, without keeping it', async () => {
      const logic = await holding([knowledge('p', 'p(1).')]);
      const found = errorsOf(
        await logic.check([
          knowledge('bad', 'result(X :- '),
          knowledge('ok', 'p(2).'),
        ]),
      );
      expect(found).not.toEqual([]);
      expect(found.every((diagnostic) => diagnostic.key === 'bad')).toBe(true);
      expect(await show(logic)).toEqual(['p(1)']);
    });

    it('answers a check while a transaction is open', async () => {
      const logic = await holding([knowledge('p', 'p(1).')]);
      const tx = await logic.begin();
      tx.set([knowledge('q', 'p(2).')]);
      expect(errorsOf(await logic.check([knowledge('c', 'c(1).')]))).toEqual(
        [],
      );
      await tx.commit();
    });

    it('exports the committed programs as text', async () => {
      const logic = await holding([knowledge('p', 'exported(1).')]);
      expect(await logic.exportText()).toContain('exported(1)');
    });
  });
}
