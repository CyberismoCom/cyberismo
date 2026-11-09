// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { afterEach, describe, expect, it, vi } from 'vitest';

import { localFolder } from '../../src/api/directory/local-folder.js';
import { clingoLogicBackend } from '../../src/infra/logic/clingo-backend.js';
import {
  LogicError,
  LogicNonTotalError,
  LogicUnavailableError,
  type LogicBackend,
  type LogicBackendFactory,
  type LogicBackendOwner,
  type LogicTransaction,
} from '../../src/infra/logic/logic-backend.js';
import { WorkspaceDisposedError } from '../../src/shared/exceptions/index.js';
import { SYSTEM_ACTOR } from '../../src/infra/tx/tx-record.js';
import type { Card } from '@cyberismo/model';
import { checkoutOf } from '../../src/state/checkout/internal.js';
import type { ProjectDirectory } from '../../src/api/directory/project-directory.js';
import { simpleGit } from 'simple-git';
import { Checkout } from '../../src/state/checkout/checkout.js';
import { buildProject, type ProjectSpec } from '../helpers/project-builder.js';

// A clingo backend per checkout that records its owner, whether it was
// closed and how many rebuilds it committed, and refuses the next commit when
// told to, after a change of its own that the refusal must not keep. Its
// queries fail with `failQueries` while that is set.
interface Recorded {
  owner: LogicBackendOwner;
  backend: LogicBackend;
  closed: boolean;
  rebuilds: number;
  refuseCommit?: LogicError;
  failQueries?: LogicError;
}

function recording() {
  const made: Recorded[] = [];
  const factory: LogicBackendFactory = (owner) => {
    const inner = clingoLogicBackend(owner);
    const record: Recorded = {
      owner,
      backend: inner,
      closed: false,
      rebuilds: 0,
    };
    record.backend = {
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
    made.push(record);
    return record.backend;
  };
  return { factory, made };
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

async function open(
  spec: ProjectSpec = {},
  options: { autocommit?: boolean } = {},
) {
  const project = await buildProject({ cards: [{ title: 'First' }], ...spec });
  cleanups.push(project.cleanup);
  const { factory, made } = recording();
  const { directory } = await localFolder(project.path, {
    logic: factory,
    ...options,
  });
  cleanups.push(() => disposeAll(directory));
  const [{ prefix }] = await directory.list();
  const ws = await directory.open(prefix, SYSTEM_ACTOR);
  return {
    directory,
    prefix,
    ws,
    made,
    key: project.keys[0],
    path: project.path,
  };
}

// Lets go of every project in the directory: a replace disposes the
// checkout it replaces.
async function disposeAll(directory: ProjectDirectory) {
  for (const { prefix } of await directory.list()) {
    const ws = await directory.open(prefix, SYSTEM_ACTOR);
    await checkoutOf(ws).dispose();
  }
}

// A replace opens the replacing checkout while the test waits, so a test
// that waits for one gets longer than its wait, which then names the cause.
const WAIT = 5000;
const TEST_TIMEOUT = 20_000;

describe('logic backend', () => {
  it(
    'closes the backend of a replaced project after its running read; its old handles are refused',
    async () => {
      const { directory, prefix, ws, made, key } = await open();
      let release!: () => void;
      const held = new Promise<void>((resolve) => (release = resolve));
      const running = checkoutOf(ws).lock.read(async () => {
        await held;
        return ws.queries.program();
      });

      const replaced = directory.replace(prefix);
      // The dispose waits for the read before it closes the backend.
      await vi.waitFor(() => expect(checkoutOf(ws).disposed).toBe(true), {
        timeout: WAIT,
      });
      // Meanwhile the directory already holds the new checkout.
      const current = await directory.open(prefix, SYSTEM_ACTOR);
      expect(checkoutOf(current).disposed).toBe(false);
      expect(await current.queries.program()).toContain(key);
      release();

      expect(await running).toContain(key);
      await replaced;
      expect(made[0].closed).toBe(true);
      expect(made[1].closed).toBe(false);
      await expect(ws.queries.program()).rejects.toThrow(
        WorkspaceDisposedError,
      );
      await expect(ws.cards.editField(key, 'title', 'Second')).rejects.toThrow(
        WorkspaceDisposedError,
      );
    },
    TEST_TIMEOUT,
  );

  it('fails a write whose result the backend refuses, and rebuilds once from the files', async () => {
    const { ws, made, key } = await open();
    made[0].refuseCommit = new LogicNonTotalError('No total answer');
    const rebuilds = made[0].rebuilds;

    await expect(ws.cards.editField(key, 'title', 'Second')).rejects.toThrow(
      LogicNonTotalError,
    );

    // Rebuilt from the files, which keep the edit without autocommit.
    expect(made[0].rebuilds).toBe(rebuilds + 1);
    expect(await ws.queries.program()).toContain('Second');
    await ws.cards.editField(key, 'title', 'Third');
    expect(await ws.queries.program()).toContain('Third');
  });

  it('keeps the programs of a refused write that changed nothing, without a rebuild', async () => {
    const { ws, made, key } = await open();
    made[0].refuseCommit = new LogicNonTotalError('No total answer');
    const rebuilds = made[0].rebuilds;

    await expect(ws.cards.rebalance(key)).rejects.toThrow(LogicError);

    expect(made[0].rebuilds).toBe(rebuilds);
    const program = await ws.queries.program();
    expect(program).toContain(key);
    expect(program).not.toContain('refused');
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

  it(
    'refuses a write queued before its project was replaced',
    async () => {
      const { directory, prefix, ws, key } = await open();
      let release!: () => void;
      const held = new Promise<void>((resolve) => (release = resolve));
      const running = checkoutOf(ws).lock.read(() => held);
      const queued = ws.cards.editField(key, 'title', 'Second');

      const replaced = directory.replace(prefix);
      await vi.waitFor(() => expect(checkoutOf(ws).disposed).toBe(true), {
        timeout: WAIT,
      });
      release();

      await running;
      await expect(queued).rejects.toThrow(WorkspaceDisposedError);
      await replaced;
    },
    TEST_TIMEOUT,
  );

  it('fails a render, not a macro, when the backend cannot answer', async () => {
    const { ws, made, key } = await open();
    const unavailable = new LogicUnavailableError('Backend down');
    made[0].failQueries = unavailable;

    await expect(
      ws.render.macros(
        `{{#field}}"cardKey": "${key}", "field": "title"{{/field}}`,
        {
          cardKey: key,
          context: 'localApp',
          mode: 'static',
        },
      ),
    ).rejects.toBe(unavailable);
  });

  it('fails an export, not the card, when the backend cannot answer', async () => {
    const { ws, made, key } = await open();
    await ws.cards.edit(
      key,
      `{{#field}}"cardKey": "${key}", "field": "title"{{/field}}`,
    );
    const unavailable = new LogicUnavailableError('Backend down');
    // The backend goes down once the export has its tree.
    const engine = checkoutOf(ws).calculationEngine;
    const runQuery = engine.runQuery.bind(engine);
    vi.spyOn(engine, 'runQuery').mockImplementationOnce((async (
      ...args: Parameters<typeof runQuery>
    ) => {
      const result = await runQuery(...args);
      made[0].failQueries = unavailable;
      return result;
    }) as typeof runQuery);

    await expect(ws.export.adoc()).rejects.toBe(unavailable);
  });

  it('rolls back a write the backend refuses under autocommit, without a commit', async () => {
    const { ws, made, key, path } = await open(
      { git: true },
      { autocommit: true },
    );
    const git = simpleGit(path);
    const head = await git.revparse(['HEAD']);
    made[0].refuseCommit = new LogicNonTotalError('No total answer');

    await expect(ws.cards.editField(key, 'title', 'Second')).rejects.toThrow(
      LogicError,
    );

    expect(await git.revparse(['HEAD'])).toBe(head);
    expect((await git.status()).isClean()).toBe(true);
    const program = await ws.queries.program();
    expect(program).toContain('First');
    expect(program).not.toContain('Second');
  });

  it('disposes a checkout whose backend fails to close, without rejecting', async () => {
    const project = await buildProject({ cards: [{}] });
    cleanups.push(project.cleanup);
    const failing: LogicBackendFactory = (owner) => {
      const inner = clingoLogicBackend(owner);
      return {
        begin: () => inner.begin(),
        query: (text) => inner.query(text),
        check: (programs) => inner.check(programs),
        exportText: () => inner.exportText(),
        close: async () => {
          await inner.close();
          throw new Error('Closing failed');
        },
      };
    };
    const checkout = await Checkout.open(project.path, { logic: failing });

    await expect(checkout.dispose()).resolves.toBeUndefined();
    expect(checkout.disposed).toBe(true);
  });

  it("answers a query in a write from the write's transaction", async () => {
    const project = await buildProject({ cards: [{ title: 'First' }] });
    cleanups.push(project.cleanup);
    const { directory } = await localFolder(project.path, { logic: isolating });
    cleanups.push(() => disposeAll(directory));
    const [{ prefix }] = await directory.list();
    const ws = await directory.open(prefix, SYSTEM_ACTOR);
    const [key] = project.keys;
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
