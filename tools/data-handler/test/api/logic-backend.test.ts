// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { afterEach, describe, expect, it, vi } from 'vitest';

import { localFolder } from '../../src/api/directory/local-folder.js';
import { clingoLogicBackend } from '../../src/infra/logic/clingo-backend.js';
import {
  LogicError,
  type LogicBackend,
  type LogicBackendFactory,
  type LogicBackendOwner,
} from '../../src/infra/logic/logic-backend.js';
import { WorkspaceDisposedError } from '../../src/shared/exceptions/index.js';
import { SYSTEM_ACTOR } from '../../src/infra/tx/tx-record.js';
import { checkoutOf } from '../../src/state/checkout/internal.js';
import { buildProject } from '../helpers/project-builder.js';

// A clingo backend per checkout that records its owner, whether it was
// closed and how many rebuilds it committed, and refuses the next commit when
// told to, after a change of its own that the refusal must not keep.
interface Recorded {
  owner: LogicBackendOwner;
  backend: LogicBackend;
  closed: boolean;
  rebuilds: number;
  refuseCommit?: LogicError;
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
      query: (text) => inner.query(text),
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

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

async function open() {
  const project = await buildProject({ cards: [{ title: 'First' }] });
  cleanups.push(project.cleanup);
  const { factory, made } = recording();
  const { directory } = await localFolder(project.path, { logic: factory });
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

describe('logic backend', () => {
  it('gives each opening of a project a backend of its own', async () => {
    const first = await open();
    const { factory, made } = recording();
    await localFolder(first.path, { logic: factory });

    const owners = [first.made[0].owner, made[0].owner];
    expect(owners.map((owner) => owner.label)).toEqual([
      first.prefix,
      first.prefix,
    ]);
    expect(owners[0].id).not.toBe(owners[1].id);
    expect(await first.ws.queries.program()).toContain(first.key);
  });

  it('closes the backend of a replaced project after its running read; its old handles are refused', async () => {
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
      timeout: 5000,
    });
    release();

    expect(await running).toContain(key);
    await replaced;
    expect(made[0].closed).toBe(true);
    expect(made[1].closed).toBe(false);
    await expect(ws.cards.details(key)).rejects.toThrow(WorkspaceDisposedError);
    await expect(ws.queries.program()).rejects.toThrow(WorkspaceDisposedError);
    await expect(ws.cards.editField(key, 'title', 'Second')).rejects.toThrow(
      WorkspaceDisposedError,
    );
  });

  it('fails a write whose result the backend refuses, and rebuilds once from the files', async () => {
    const { ws, made, key } = await open();
    made[0].refuseCommit = new LogicError('nonTotal', 'No total answer');
    const rebuilds = made[0].rebuilds;

    await expect(ws.cards.editField(key, 'title', 'Second')).rejects.toThrow(
      expect.objectContaining({ kind: 'nonTotal' }),
    );

    // Rebuilt from the files, which keep the edit without autocommit.
    expect(made[0].rebuilds).toBe(rebuilds + 1);
    expect(await ws.queries.program()).toContain('Second');
    expect(await ws.queries.program()).not.toContain('refused');
    await ws.cards.editField(key, 'title', 'Third');
    expect(await ws.queries.program()).toContain('Third');
  });

  it('keeps the programs of a refused write that changed nothing, without a rebuild', async () => {
    const { ws, made, key } = await open();
    made[0].refuseCommit = new LogicError('nonTotal', 'No total answer');
    const rebuilds = made[0].rebuilds;

    await expect(ws.cards.rebalance(key)).rejects.toThrow(LogicError);

    expect(made[0].rebuilds).toBe(rebuilds);
    const program = await ws.queries.program();
    expect(program).toContain(key);
    expect(program).not.toContain('refused');
  });
});
