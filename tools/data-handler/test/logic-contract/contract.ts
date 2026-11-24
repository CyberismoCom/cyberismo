// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { afterEach, describe, expect, it } from 'vitest';
import type {
  Diagnostic,
  LogicBackend,
  LogicError,
  Program,
  QueryResult,
} from '../../src/infra/logic/logic-backend.js';

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
const atoms = (result: QueryResult) =>
  result.answers
    .flatMap((answer) => answer.split('\n'))
    .filter((atom) => atom.trim() !== '')
    .sort();

const errorsOf = (diagnostics: Diagnostic[]) =>
  diagnostics.filter((diagnostic) => diagnostic.severity === 'error');

// A logic failure is told by its code, not its class: a backend in another
// package throws the classes of its own copy of data-handler.
const logicFailure = (code?: string) => ({
  code:
    code ??
    expect.stringMatching(/^logic-(invalid|non-total|unavailable|internal)$/),
});

const failure = (call: Promise<unknown>) =>
  call.then(
    () => undefined,
    (error: unknown) => error,
  );

/** What the contract leaves to the backend. */
export interface LogicBackendContractOptions {
  /**
   * Whether a commit refuses programs without a total answer. A backend that
   * refuses must keep the committed programs as they were; one that does not
   * must keep the result, whose queries then fail as non-total.
   */
  refusesNonTotal: boolean;
}

/**
 * The contract of the `LogicBackend` port as a vitest suite: what the
 * checkout relies on, and nothing a backend may do differently. `create`
 * makes a fresh backend for each test; the suite closes it.
 *
 * It lives in data-handler's tests and changes with the port: a backend in
 * another package runs it by importing this file, and a change to the port
 * may add requirements a backend that passed before fails.
 */
export function describeLogicBackendContract(
  name: string,
  create: () => LogicBackend | Promise<LogicBackend>,
  backendOptions: LogicBackendContractOptions,
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

    it('leaves the committed programs as they were after an abort, and replaces them all with replaceAll', async () => {
      const logic = await holding([
        knowledge('p', 'p(1).'),
        knowledge('q', 'p(2).'),
      ]);
      const aborted = await logic.begin();
      aborted.set([knowledge('p', 'p(3).'), knowledge('r', 'p(4).')]);
      aborted.remove(['q']);
      aborted.replaceAll([knowledge('s', 'p(5).')]);
      await aborted.abort();
      expect(await show(logic)).toEqual(['p(1)', 'p(2)']);

      const tx = await logic.begin();
      // The next transaction starts from the committed programs.
      expect(atoms(await tx.query('#show p/1.'))).toEqual(['p(1)', 'p(2)']);
      tx.replaceAll([knowledge('r', 'p(5).')]);
      await tx.commit();
      expect(await show(logic)).toEqual(['p(5)']);
    });

    it('refuses a commit without a total answer, or keeps it, as the backend does', async () => {
      const logic = await holding([knowledge('p', 'p(1).')]);
      const tx = await logic.begin();
      tx.set([knowledge('q', 'p(2).')]);
      expect(atoms(await tx.query('#show p/1.'))).toEqual(['p(1)', 'p(2)']);
      tx.set([knowledge('u', UNDEFINED_WITH_P1)]);
      const refused = await failure(tx.commit());
      if (backendOptions.refusesNonTotal) {
        // The committed programs stay as they were.
        expect(refused).toMatchObject(logicFailure());
        expect(await show(logic)).toEqual(['p(1)']);
      } else {
        // The result is kept, so its queries have no total answer.
        expect(refused).toBe(undefined);
        expect(await failure(logic.query('#show p/1.'))).toMatchObject(
          logicFailure('logic-non-total'),
        );
      }
    });

    it('opens one transaction at a time, and refuses one that has ended', async () => {
      const logic = await holding();
      const tx = await logic.begin();
      expect(await failure(logic.begin())).toMatchObject(logicFailure());
      await tx.commit();
      expect(await failure(tx.commit())).toMatchObject(logicFailure());
      await (await logic.begin()).abort();
    });

    it('fails a query that does not parse as invalid, with diagnostics, keeping a transaction open', async () => {
      const logic = await holding([knowledge('p', 'p(1).')]);
      const error = await failure(logic.query('result(X :- '));
      expect(error).toMatchObject(logicFailure('logic-invalid'));
      expect(errorsOf((error as LogicError).diagnostics)).not.toEqual([]);

      const tx = await logic.begin();
      tx.set([knowledge('q', 'p(2).')]);
      expect(await failure(tx.query('result(X :- '))).toMatchObject(
        logicFailure(),
      );
      await tx.commit();
      expect(await show(logic)).toEqual(['p(1)', 'p(2)']);
    });

    it('fails a query as non-total on programs kept without a total answer', async () => {
      const logic = await holding([
        knowledge('p', `p(1). ${UNDEFINED_WITH_P1}`),
      ]);
      const error = await failure(logic.query('#show p/1.'));
      expect(error).toMatchObject(logicFailure('logic-non-total'));
      const tx = await logic.begin();
      const inTransaction = await failure(tx.query('#show p/1.'));
      expect(inTransaction).toMatchObject(logicFailure('logic-non-total'));
      await tx.abort();
    });

    it('checks each program on its own, naming its key, without keeping it, also in a transaction', async () => {
      const logic = await holding([knowledge('p', 'p(1).')]);
      const tx = await logic.begin();
      tx.set([knowledge('q', 'p(2).')]);
      const found = errorsOf(
        await logic.check([
          knowledge('bad', 'result(X :- '),
          knowledge('ok', 'p(6).'),
        ]),
      );
      expect(found).not.toEqual([]);
      expect(found.every((diagnostic) => diagnostic.key === 'bad')).toBe(true);
      await tx.commit();
      expect(await show(logic)).toEqual(['p(1)', 'p(2)']);
    });

    it('exports the committed programs as text, and only them', async () => {
      const logic = await holding([
        knowledge('p', 'exported(1).'),
        knowledge('q', 'removed(1).'),
      ]);
      const tx = await logic.begin();
      tx.remove(['q']);
      await tx.commit();
      const open = await logic.begin();
      open.set([knowledge('r', 'uncommitted(1).')]);
      await open.abort();
      const text = await logic.exportText();
      expect(text).toContain('exported(1)');
      expect(text).not.toContain('removed(1)');
      expect(text).not.toContain('uncommitted(1)');
    });

    it('fails every call as unavailable after close, and closes again', async () => {
      const logic = await holding([knowledge('p', 'p(1).')]);
      await logic.close();
      await logic.close();
      // Each call is made only when awaited, so none rejects unhandled.
      const calls = [
        () => logic.begin(),
        () => logic.query('#show p/1.'),
        () => logic.check([knowledge('c', 'c(1).')]),
        () => logic.exportText(),
      ];
      for (const call of calls) {
        const error = await failure(call());
        expect(error).toMatchObject(logicFailure('logic-unavailable'));
      }
    });
  });
}
