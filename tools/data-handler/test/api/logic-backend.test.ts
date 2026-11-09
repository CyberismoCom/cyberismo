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
import { buildProject } from '../helpers/project-builder.js';

// A clingo backend per checkout that records its owner and whether it was
// closed, and refuses the next commit when told to, dropping every program as
// a backend that applies changes in place may.
interface Recorded {
  owner: LogicBackendOwner;
  backend: LogicBackend;
  closed: boolean;
  refuseCommit?: LogicError;
  // After the refusal, the next begin fails once.
  thenFailBegin?: boolean;
  failBegins?: number;
}

function recording() {
  const made: Recorded[] = [];
  const factory: LogicBackendFactory = (owner) => {
    const inner = clingoLogicBackend(owner);
    const record: Recorded = { owner, backend: inner, closed: false };
    record.backend = {
      begin: async () => {
        if (record.failBegins) {
          record.failBegins--;
          throw new LogicError('unavailable', 'Not now');
        }
        const tx = await inner.begin();
        return {
          ...tx,
          commit: async () => {
            const refusal = record.refuseCommit;
            record.refuseCommit = undefined;
            if (refusal) {
              tx.replaceAll([]);
              await tx.commit();
              if (record.thenFailBegin) record.failBegins = 1;
              throw refusal;
            }
            await tx.commit();
          },
        };
      },
      query: (text) => inner.query(text),
      check: (programs, options) => inner.check(programs, options),
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
  it('logic/backend: Each opening of a project has a backend of its own', async () => {
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

  it('logic/backend: A replaced project lets go of its backend', async () => {
    const { directory, prefix, ws, made } = await open();

    await directory.replace(prefix);

    await vi.waitFor(() => expect(made[0].closed).toBe(true));
    expect(made[1].closed).toBe(false);
    await expect(ws.queries.program()).rejects.toThrow(WorkspaceDisposedError);
  });

  it('logic/backend: A backend that lost its programs gets them again', async () => {
    const { ws, made, key } = await open();
    const lost = await made[0].backend.begin();
    lost.replaceAll([]);
    await lost.commit();
    expect(await ws.queries.program()).not.toContain(key);

    await made[0].owner.resync();

    expect(await ws.queries.program()).toContain(key);
  });

  it('logic/backend: A write whose result the backend refuses fails', async () => {
    const { ws, made, key } = await open();
    made[0].refuseCommit = new LogicError('nonTotal', 'No total answer');

    await expect(ws.cards.editField(key, 'title', 'Second')).rejects.toThrow(
      expect.objectContaining({ kind: 'nonTotal' }),
    );

    // Rebuilt from the files, which keep the edit without autocommit.
    expect(await ws.queries.program()).toContain('Second');
    await ws.cards.editField(key, 'title', 'Third');
    expect(await ws.queries.program()).toContain('Third');
  });

  it('logic/backend: A write that changed nothing and was refused leaves the programs rebuilt', async () => {
    const { ws, made, key } = await open();
    made[0].refuseCommit = new LogicError('nonTotal', 'No total answer');

    await expect(ws.cards.rebalance(key)).rejects.toThrow(LogicError);

    expect(await ws.queries.program()).toContain(key);
  });

  it('logic/backend: A rebuild that failed is tried again', async () => {
    const { ws, made, key } = await open();
    made[0].refuseCommit = new LogicError('nonTotal', 'No total answer');
    made[0].thenFailBegin = true;

    await expect(ws.cards.rebalance(key)).rejects.toThrow(LogicError);

    expect(await ws.queries.program()).toContain(key);
  });
});
