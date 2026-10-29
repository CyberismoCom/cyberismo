// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from 'vitest';

import { commitTrailers } from '../../../src/infra/tx/tx-record.js';

describe('commitTrailers', () => {
  it('records nothing for an actor without an agent', () => {
    expect(
      commitTrailers({ kind: 'connector', id: 'svc-1', name: 'Importer' }),
    ).toEqual({});
  });

  it('records the agent that acted for the actor', () => {
    expect(
      commitTrailers({
        kind: 'user',
        id: 'u1',
        name: 'U',
        agent: { name: 'claude-code' },
      }),
    ).toEqual({ 'Cyberismo-Agent': 'claude-code' });
  });
});
