/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { describe, expect, it } from 'vitest';

import { commitTrailers } from '../src/shared/utils/tx-record.js';

describe('commitTrailers', () => {
  it('records the actor as kind:id', () => {
    expect(
      commitTrailers({ kind: 'connector', id: 'svc-1', name: 'Importer' }),
    ).toEqual({ 'Cyberismo-Actor': 'connector:svc-1' });
  });

  it('records the agent that acted for the actor', () => {
    expect(
      commitTrailers({
        kind: 'user',
        id: 'u1',
        name: 'U',
        agent: { name: 'claude-code' },
      }),
    ).toEqual({
      'Cyberismo-Actor': 'user:u1',
      'Cyberismo-Agent': 'claude-code',
    });
  });
});
