// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clingoLogicBackend,
  LogicUnavailableError,
  type LogicBackendFactory,
  type Workspace,
} from '@cyberismo/data-handler';
import { createApp } from '../src/app.js';
import { MockAuthProvider, MOCK_ROLE_COOKIE } from '../src/auth/mock.js';
import {
  buildProject,
  type BuiltProject,
} from '../../data-handler/test/helpers/project-builder.js';
import {
  openTestWorkspace,
  directoryOf,
} from './helpers/open-test-workspace.js';

let project: BuiltProject;
let ws: Workspace;
let app: ReturnType<typeof createApp>;

// Clingo, unavailable while `down` names the call that fails: a query, or
// the commit that completes a write.
let down: 'query' | 'commit' | undefined;
const logic: LogicBackendFactory = (owner) => {
  const inner = clingoLogicBackend(owner);
  const unavailable = () => new LogicUnavailableError('Lost the programs');
  return {
    begin: async () => {
      const tx = await inner.begin();
      return {
        set: (programs) => tx.set(programs),
        remove: (keys) => tx.remove(keys),
        replaceAll: (programs) => tx.replaceAll(programs),
        query: async (text) => {
          if (down === 'query') throw unavailable();
          return tx.query(text);
        },
        commit: async (options) => {
          if (down === 'commit') {
            await tx.abort();
            throw unavailable();
          }
          return tx.commit(options);
        },
        abort: () => tx.abort(),
      };
    },
    query: async (text) => {
      if (down === 'query') throw unavailable();
      return inner.query(text);
    },
    check: (programs) => inner.check(programs),
    exportText: () => inner.exportText(),
    close: () => inner.close(),
  };
};

beforeEach(async () => {
  down = undefined;
  project = await buildProject({
    templates: [{ name: 'tpl', cards: [{ title: 'From template' }] }],
    cards: [{ title: 'Host' }],
  });
  ws = await openTestWorkspace(project.path, { logic });
  app = createApp(new MockAuthProvider(), directoryOf(ws));
});

afterEach(async () => {
  await project.cleanup();
});

const post = (key: string, body: unknown, role?: string) =>
  app.request(`/api/projects/test/cards/${key}/action`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(role ? { cookie: `${MOCK_ROLE_COOKIE}=${role}` } : {}),
    },
    body: JSON.stringify(body),
  });

const create = 'create(C, "test/templates/tpl") :- actionCard(C).';

describe('POST /cards/:key/action', () => {
  it('runs the posted programs on the card', async () => {
    const host = project.keys[0];
    const response = await post(host, {
      programs: [create, 'transition(C, "To Closed") :- actionCard(C).'],
    });

    expect(response.status).toBe(200);
    const { created } = await response.json();
    expect(created).toEqual([
      { key: expect.any(String), title: 'From template' },
    ]);
    const card = await ws.cards.details(host);
    expect(card.children).toEqual([created[0].key]);
    expect(card.metadata?.workflowState).toBe('Closed');
  });

  it('readers cannot run an action', async () => {
    const response = await post(
      project.keys[0],
      { programs: [create] },
      'reader',
    );
    expect(response.status).toBe(403);
    expect((await ws.cards.details(project.keys[0])).children).toEqual([]);
  });

  it('an unknown card is 404', async () => {
    const response = await post('test_nope', { programs: [create] });
    expect(response.status).toBe(404);
  });

  // A busy backend before anything was applied can be retried; one when the
  // write completes cannot, as the card was already created.
  it.each([
    ['before anything was applied', 'query', { applied: false }, []],
    ['when the write completes', 'commit', {}, [expect.any(String)]],
  ] as const)('tells a busy backend %s', async (_, call, details, children) => {
    down = call;
    const response = await post(project.keys[0], { programs: [create] });
    down = undefined;

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.code).toBe('logic-unavailable');
    expect(body.details.applied).toBe(details.applied);
    expect(body.details.program).toBeUndefined();
    expect((await ws.cards.details(project.keys[0])).children).toEqual(
      children,
    );
  });

  it.each([
    ['empty programs', [], 400, undefined, undefined],
    ['an empty program', [''], 400, undefined, undefined],
    [
      'a check refusal',
      ['transition(C, "Nope") :- actionCard(C).'],
      400,
      'validation',
      /transition\(test_\w+,"Nope"\)/,
    ],
    ['an invalid program', ['a :-'], 400, 'logic-invalid', undefined],
    [
      'an unsatisfiable program',
      [':- actionCard(_).'],
      422,
      'logic-non-total',
      undefined,
    ],
  ])('refuses %s', async (_, programs, status, code, message) => {
    const response = await post(project.keys[0], { programs });

    expect(response.status).toBe(status);
    const body = await response.json();
    if (code) expect(body.code).toBe(code);
    if (message) expect(body.message).toMatch(message);
    expect((await ws.cards.details(project.keys[0])).children).toEqual([]);
  });
});
