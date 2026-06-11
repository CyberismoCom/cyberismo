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

import { describe, it, expect } from 'vitest';
import { entryToMutationInput } from '../../../src/mutations/replay/convert.js';

describe('entryToMutationInput', () => {
  it('converts resource_update', () => {
    expect(
      entryToMutationInput({
        timestamp: '2026-01-01T00:00:00Z',
        operation: 'resource_update',
        target: 'mod/workflows/simple',
        parameters: {
          type: 'workflows',
          key: 'states',
          operation: { name: 'remove', target: { name: 'Draft' } },
        },
      }),
    ).toEqual({
      kind: 'edit',
      target: expect.objectContaining({
        prefix: 'mod',
        type: 'workflows',
        identifier: 'simple',
      }),
      updateKey: { key: 'states' },
      operation: { name: 'remove', target: { name: 'Draft' } },
    });
  });

  it('passes the logged operation through verbatim', () => {
    const operation = { name: 'remove', target: { enumValue: 'low' } };
    const input = entryToMutationInput({
      timestamp: '2026-01-01T00:00:00Z',
      operation: 'resource_update',
      target: 'mod/fieldTypes/severity',
      parameters: { type: 'fieldTypes', key: 'enumValues', operation },
    });
    expect(input.kind).toBe('edit');
    if (input.kind === 'edit') {
      expect(input.operation).toBe(operation);
    }
  });

  it('converts resource_delete', () => {
    expect(
      entryToMutationInput({
        timestamp: '2026-01-01T00:00:00Z',
        operation: 'resource_delete',
        target: 'mod/fieldTypes/severity',
        parameters: { type: 'fieldTypes' },
      }),
    ).toEqual({
      kind: 'delete',
      target: expect.objectContaining({
        prefix: 'mod',
        type: 'fieldTypes',
        identifier: 'severity',
      }),
    });
  });

  it('converts resource_rename', () => {
    expect(
      entryToMutationInput({
        timestamp: '2026-01-01T00:00:00Z',
        operation: 'resource_rename',
        target: 'mod/fieldTypes/severity',
        parameters: {
          type: 'fieldTypes',
          operation: {
            name: 'change',
            target: 'mod/fieldTypes/severity',
            to: 'mod/fieldTypes/priority',
          },
        },
      }),
    ).toEqual({
      kind: 'rename',
      target: expect.objectContaining({
        prefix: 'mod',
        type: 'fieldTypes',
        identifier: 'severity',
      }),
      newIdentifier: 'priority',
    });
  });

  it('converts project_rename with the recorded old prefix', () => {
    expect(
      entryToMutationInput({
        timestamp: '2026-01-01T00:00:00Z',
        operation: 'project_rename',
        target: 'newmod',
        parameters: { oldPrefix: 'mod', newPrefix: 'newmod' },
      }),
    ).toEqual({
      kind: 'project_rename',
      newPrefix: 'newmod',
      oldPrefix: 'mod',
    });
  });

  it('throws on a resource_rename entry without operation.to', () => {
    expect(() =>
      entryToMutationInput({
        timestamp: 't',
        operation: 'resource_rename',
        target: 'mod/fieldTypes/severity',
        parameters: { type: 'fieldTypes' },
      }),
    ).toThrow(/resource_rename.*mod\/fieldTypes\/severity/);
  });

  it('throws on a resource_update entry without a key', () => {
    expect(() =>
      entryToMutationInput({
        timestamp: 't',
        operation: 'resource_update',
        target: 'mod/workflows/simple',
        parameters: {
          type: 'workflows',
          operation: { name: 'remove', target: { name: 'Draft' } },
        },
      }),
    ).toThrow(/resource_update.*mod\/workflows\/simple/);
  });

  it('throws on a resource_update entry without an operation', () => {
    expect(() =>
      entryToMutationInput({
        timestamp: 't',
        operation: 'resource_update',
        target: 'mod/workflows/simple',
        parameters: { type: 'workflows', key: 'states' },
      }),
    ).toThrow(/resource_update.*mod\/workflows\/simple/);
  });

  it('throws on a project_rename entry without prefixes', () => {
    expect(() =>
      entryToMutationInput({
        timestamp: 't',
        operation: 'project_rename',
        target: 'newmod',
        parameters: { newPrefix: 'newmod' },
      }),
    ).toThrow(/project_rename.*newmod/);

    expect(() =>
      entryToMutationInput({
        timestamp: 't',
        operation: 'project_rename',
        target: 'newmod',
        parameters: { oldPrefix: 'mod' },
      }),
    ).toThrow(/project_rename.*newmod/);
  });
});
