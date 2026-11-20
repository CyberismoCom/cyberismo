// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { afterEach, describe, expect, it, vi } from 'vitest';

import { localFolder } from '../../src/api/directory/local-folder.js';
import { clingoLogicBackend } from '../../src/infra/logic/clingo-backend.js';
import {
  LogicError,
  LogicNonTotalError,
  LogicUnavailableError,
  type LogicBackendFactory,
  type LogicTransaction,
} from '../../src/infra/logic/logic-backend.js';
import { WorkspaceDisposedError } from '../../src/shared/exceptions/index.js';
import { SYSTEM_ACTOR } from '../../src/infra/tx/tx-record.js';
import type { Card } from '@cyberismo/model';
import { checkoutOf } from '../../src/state/checkout/internal.js';
import type { ProjectDirectory } from '../../src/api/directory/project-directory.js';
import { buildProject } from '../helpers/project-builder.js';

// Clingo, recording each backend made: whether it was closed, whether the
// backends made before it were, and how many rebuilds it committed. It
// refuses the next commit when told to, after a change of its own that the
// refusal must not keep, and fails its queries while `failQueries` is set.
interface Recorded {
  closed: boolean;
  othersClosed: boolean;
  rebuilds: number;
  refuseCommit?: LogicError;
  failQueries?: LogicError;
}

function recording() {
  const made: Recorded[] = [];
  const state = { failOpen: false };
  const factory: LogicBackendFactory = (owner) => {
    if (state.failOpen) throw new Error('Cannot open the backend');
    const inner = clingoLogicBackend(owner);
    const record: Recorded = {
      closed: false,
      othersClosed: made.every((other) => other.closed),
      rebuilds: 0,
    };
    made.push(record);
    return {
      begin: async () => {
        const tx = await inner.begin();
        return {
          ...tx,
          commit: async (options) => {
            const refusal = record.refuseCommit;
            record.refuseCommit = undefined;
            if (refusal) {
              tx.set([{ key: 'refused', role: 'knowledge', text: 'refused.' }]);
              await tx.abort();
              throw refusal;
            }
            await tx.commit(options);
            if (options?.keepNonTotal) record.rebuilds++;
          },
        };
      },
      query: (text) =>
        record.failQueries
          ? Promise.reject(record.failQueries)
          : inner.query(text),
      check: (programs) => inner.check(programs),
      exportText: () => inner.exportText(),
      close: async () => {
        record.closed = true;
        await inner.close();
      },
    };
  };
  return { factory, made, state };
}

// A clingo backend whose transaction keeps its changes to itself until it
// commits, as a backend with programs of its own per transaction does; clingo
// applies them in place, so a query in a write that went past the
// transaction would still see them.
const isolating: LogicBackendFactory = (owner) => {
  const inner = clingoLogicBackend(owner);
  return {
    begin: async () => {
      const changes: ((tx: LogicTransaction) => void)[] = [];
      // The committed programs with the changes, in a clingo transaction.
      const applied = async () => {
        const tx = await inner.begin();
        for (const change of changes) change(tx);
        return tx;
      };
      return {
        set: (programs) => {
          changes.push((tx) => tx.set(programs));
        },
        remove: (keys) => {
          changes.push((tx) => tx.remove(keys));
        },
        replaceAll: (programs) => {
          changes.push((tx) => tx.replaceAll(programs));
        },
        query: async (text) => {
          const tx = await applied();
          try {
            return await tx.query(text);
          } finally {
            await tx.abort();
          }
        },
        commit: async (options) => (await applied()).commit(options),
        abort: async () => {},
      };
    },
    query: (text) => inner.query(text),
    check: (programs) => inner.check(programs),
    exportText: () => inner.exportText(),
    close: () => inner.close(),
  };
};

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

// A project with one card, 'First', opened with `logic`, by default one that
// records its backends.
async function open(logic?: LogicBackendFactory) {
  const project = await buildProject({ cards: [{ title: 'First' }] });
  cleanups.push(project.cleanup);
  const { factory, made, state } = recording();
  const { directory } = await localFolder(project.path, {
    logic: logic ?? factory,
  });
  cleanups.push(() => disposeAll(directory));
  const [{ prefix }] = await directory.list();
  const ws = await directory.open(prefix, SYSTEM_ACTOR);
  return { directory, prefix, ws, made, state, key: project.keys[0] };
}

async function disposeAll(directory: ProjectDirectory) {
  for (const { prefix } of await directory.list()) {
    const ws = await directory.open(prefix, SYSTEM_ACTOR);
    await checkoutOf(ws).dispose();
  }
}

describe('logic backend', () => {
  it('lets go of a replaced checkout before reopening it, and makes it a backend of its own', async () => {
    const { directory, prefix, ws, made, key } = await open();
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const running = checkoutOf(ws).lock.read(async () => {
      await held;
      return ws.queries.program();
    });
    const queued = ws.cards.editField(key, 'title', 'Second');

    const replaced = directory.replace(prefix);
    await vi.waitFor(() => expect(checkoutOf(ws).disposed).toBe(true));
    // Opened during the reopen, it waits for the reopened checkout.
    const reopened = directory.open(prefix, SYSTEM_ACTOR);
    expect(made).toHaveLength(1);
    release();

    expect(await running).toContain(key);
    await expect(queued).rejects.toThrow(WorkspaceDisposedError);
    await replaced;
    const current = await reopened;
    expect(checkoutOf(current).disposed).toBe(false);
    expect(await current.queries.program()).toContain('First');
    expect(made).toHaveLength(2);
    expect(made[0].closed).toBe(true);
    expect(made[1].othersClosed).toBe(true);
    await expect(ws.queries.program()).rejects.toThrow(WorkspaceDisposedError);
  });

  it('fails the opens of a project that failed to reopen, until a replace succeeds', async () => {
    const { directory, prefix, state } = await open();
    state.failOpen = true;

    await expect(directory.replace(prefix)).rejects.toThrow(
      'Cannot open the backend',
    );
    await expect(directory.open(prefix, SYSTEM_ACTOR)).rejects.toThrow(
      /failed to reopen: Cannot open the backend/,
    );

    state.failOpen = false;
    await directory.replace(prefix);
    const ws = await directory.open(prefix, SYSTEM_ACTOR);
    expect(await ws.queries.program()).toContain('First');
  });

  it('fails a write whose result the backend refuses, rebuilding from the files only if it changed something', async () => {
    const { ws, made, key } = await open();
    const rebuilds = made[0].rebuilds;

    // A rebalance of a lone card changes nothing.
    made[0].refuseCommit = new LogicNonTotalError('No total answer');
    await expect(ws.cards.rebalance(key)).rejects.toThrow(LogicError);
    expect(made[0].rebuilds).toBe(rebuilds);
    expect(await ws.queries.program()).not.toContain('refused');

    made[0].refuseCommit = new LogicNonTotalError('No total answer');
    await expect(ws.cards.editField(key, 'title', 'Second')).rejects.toThrow(
      LogicNonTotalError,
    );
    // Rebuilt from the files, which keep the edit without autocommit.
    expect(made[0].rebuilds).toBe(rebuilds + 1);
    expect(await ws.queries.program()).toContain('Second');
    await ws.cards.editField(key, 'title', 'Third');
    expect(await ws.queries.program()).toContain('Third');
  });

  it('ends the logic transaction of a write that fails, keeping the committed programs', async () => {
    const { ws, key } = await open();
    const checkout = checkoutOf(ws);

    await expect(
      checkout.lock.write({ actor: SYSTEM_ACTOR }, async () => {
        await checkout.calculationEngine.handleDeleteCard({ key } as Card);
        throw new Error('failed mid-write');
      }),
    ).rejects.toThrow('failed mid-write');

    expect(await ws.queries.program()).toContain(key);
    await ws.cards.editField(key, 'title', 'Second');
    expect(await ws.queries.program()).toContain('Second');
  });

  it('fails a render, not a macro, when the backend cannot answer', async () => {
    const { ws, made, key } = await open();
    const unavailable = new LogicUnavailableError('Backend down');
    made[0].failQueries = unavailable;

    await expect(
      ws.render.macros(
        `{{#field}}"cardKey": "${key}", "field": "title"{{/field}}`,
        { cardKey: key, context: 'localApp', mode: 'static' },
      ),
    ).rejects.toBe(unavailable);
  });

  it("answers a query in a write from the write's transaction", async () => {
    const { ws, key } = await open(isolating);
    const checkout = checkoutOf(ws);
    const cards = async () =>
      (
        await checkout.calculationEngine.runLogicProgram(
          'result(C) :- card(C).',
        )
      ).results.map((row) => row.key);

    expect(await cards()).toEqual([key]);
    await expect(
      checkout.lock.write({ actor: SYSTEM_ACTOR }, async () => {
        await checkout.calculationEngine.handleDeleteCard({ key } as Card);
        expect(await cards()).toEqual([]);
        throw new Error('failed mid-write');
      }),
    ).rejects.toThrow('failed mid-write');
    expect(await cards()).toEqual([key]);
  });
});
