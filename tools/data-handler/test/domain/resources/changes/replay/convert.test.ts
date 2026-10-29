// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from 'vitest';
import { entryToMutationInput } from '../../../../../src/domain/resources/changes/replay/convert.js';
import type { ConfigurationLogEntry } from '../../../../../src/infra/replay-log/configuration-logger.js';

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

  it('throws on an unknown operation', () => {
    expect(() =>
      entryToMutationInput({
        timestamp: 't',
        operation: 'resource_frobnicate',
        target: 'mod/fieldTypes/a',
      } as unknown as ConfigurationLogEntry),
    ).toThrow(/Unknown operation 'resource_frobnicate'/);
  });

  it('throws on a retired operation', () => {
    // `project_rename` was written by older builds. It is no longer part of
    // the vocabulary, so the converter treats it like any other operation it
    // does not know. Seal replay skips such entries before reaching here;
    // this path is what the author-side version gate hits on its own log.
    expect(() =>
      entryToMutationInput({
        timestamp: 't',
        operation: 'project_rename',
        target: 'newmod',
        parameters: { oldPrefix: 'mod', newPrefix: 'newmod' },
      } as unknown as ConfigurationLogEntry),
    ).toThrow(/Unknown operation 'project_rename'/);
  });
});
