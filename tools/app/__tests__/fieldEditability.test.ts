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

const denied = [{ fieldName: 'f', errorMessage: 'Locked by policy' }];

describe('fieldEditability', () => {
  it.each([
    {
      name: 'role below Editor',
      card: card(field(false, false)),
      canEditRole: false,
      expected: { disabled: true, cause: 'role' },
    },
    {
      name: 'calculated, not overridable',
      card: card(field(true, false)),
      expected: { disabled: true, cause: 'calculated' },
    },
    {
      name: 'calculated, overridable',
      card: card(field(true, true)),
      expected: { disabled: false },
    },
    {
      name: 'denied with a message',
      card: card(field(false, false), denied),
      expected: { disabled: true, cause: 'denied', reason: 'Locked by policy' },
    },
    {
      name: 'readOnly',
      card: card(field(false, false)),
      readOnly: true,
      expected: { disabled: true, cause: 'readOnly' },
    },
    {
      name: 'editable',
      card: card(field(false, false)),
      expected: { disabled: false },
    },
    // The order is the real logic: readOnly, then role, calculated, denied.
    {
      name: 'readOnly wins over denied',
      card: card(field(false, false), denied),
      readOnly: true,
      expected: { disabled: true, cause: 'readOnly' },
    },
    {
      name: 'role wins over calculated',
      card: card(field(true, false)),
      canEditRole: false,
      expected: { disabled: true, cause: 'role' },
    },
    {
      name: 'calculated wins over denied',
      card: card(field(true, false), denied),
      expected: { disabled: true, cause: 'calculated' },
    },
  ])('$name', ({ expected, ...c }) => {
    const result = fieldEditability({
      card: c.card,
      fieldKey: 'f',
      canEditRole: c.canEditRole ?? true,
      readOnly: c.readOnly,
    });
    expect(result.disabled).toBe(expected.disabled);
    expect(result.cause).toBe(expected.cause);
    if ('reason' in expected) expect(result.reason).toBe(expected.reason);
  });
});
