// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from 'vitest';
import { fieldEditability } from '@/lib/fieldEditability';
import type { CardView } from '@/lib/api/types';

const field = (isCalculated: boolean, isOverridable: boolean) =>
  ({ key: 'f', isCalculated, isOverridable }) as CardView['fields'][number];

const card = (
  f: CardView['fields'][number],
  denied: { fieldName: string; errorMessage: string }[] = [],
) =>
  ({
    fields: [f],
    deniedOperations: { editField: denied },
  }) as unknown as CardView;

describe('fieldEditability', () => {
  it.each([
    {
      name: 'role below Editor',
      card: card(field(false, false)),
      canEditRole: false,
      expected: { disabled: true, reason: /editor permissions/ },
    },
    {
      name: 'calculated, not overridable',
      card: card(field(true, false)),
      expected: { disabled: true, reason: /calculated/ },
    },
    {
      name: 'calculated, overridable',
      card: card(field(true, true)),
      expected: { disabled: false },
    },
    {
      name: 'denied with a message',
      card: card(field(false, false), [
        { fieldName: 'f', errorMessage: 'Locked by policy' },
      ]),
      expected: { disabled: true, reason: 'Locked by policy' },
    },
    {
      name: 'title denied',
      card: card(field(false, false), [
        { fieldName: 'title', errorMessage: 'No title edits' },
      ]),
      fieldKey: 'title',
      expected: { disabled: true, reason: 'No title edits' },
    },
    {
      name: 'readOnly',
      card: card(field(false, false)),
      readOnly: true,
      expected: { disabled: true, reason: undefined },
    },
    {
      name: 'editable',
      card: card(field(false, false)),
      expected: { disabled: false },
    },
  ])('$name', ({ expected, ...c }) => {
    const result = fieldEditability({
      card: c.card,
      fieldKey: c.fieldKey ?? 'f',
      canEditRole: c.canEditRole ?? true,
      readOnly: c.readOnly,
    });
    expect(result.disabled).toBe(expected.disabled);
    if (expected.reason instanceof RegExp) {
      expect(result.reason).toMatch(expected.reason);
    } else {
      expect(result.reason).toBe(expected.reason);
    }
  });
});
