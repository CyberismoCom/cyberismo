// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from 'vitest';
import type { Card, CardType, FieldType } from '@cyberismo/model';
import { templateCardView } from '@/components/config-editors/template-card/source-view';

const enumValues = [{ enumValue: 'a', enumDisplayValue: 'A' }];

const fieldTypes = [
  ['plain', 'shortText'],
  ['calc', 'shortText'],
  ['over', 'shortText'],
  ['choice', 'enum'],
  ['many', 'list'],
].map(([name, dataType]) => ({
  name,
  displayName: `Display ${name}`,
  description: `About ${name}`,
  dataType,
  enumValues: dataType === 'enum' ? enumValues : undefined,
})) as unknown as FieldType[];

const cardType = {
  name: 'ct',
  customFields: [
    { name: 'plain' },
    { name: 'calc', isCalculated: true },
    { name: 'over', isCalculated: true, enableOverride: true },
    { name: 'choice' },
    { name: 'many' },
  ],
} as unknown as CardType;

const source = {
  key: 'c1',
  path: '/p/c1',
  content: '== Body',
  attachments: [],
  metadata: {
    title: 'T',
    cardType: 'ct',
    rank: '0|a',
    labels: ['l'],
    lastUpdated: 'u',
    createdAt: 'c',
    plain: 'p',
    calc: 'stored',
    over: 'stored',
    choice: 'a',
    many: ['x', 'y'],
  },
} as unknown as Card;

const field = (card: Card, key: string) =>
  templateCardView(card, cardType, fieldTypes)?.fields.find(
    (f) => f.key === key,
  );

describe('templateCardView', () => {
  it.each([
    [
      'plain',
      source,
      {
        isOverridable: false,
        overrideValue: undefined,
        value: 'p',
        enumValues: [],
      },
    ],
    [
      'calc',
      source,
      {
        isOverridable: false,
        overrideValue: undefined,
        value: 'stored',
        enumValues: [],
      },
    ],
    [
      'over',
      source,
      {
        isOverridable: true,
        overrideValue: 'stored',
        value: 'stored',
        enumValues: [],
      },
    ],
    [
      'over',
      { ...source, metadata: { ...source.metadata, over: undefined } } as Card,
      {
        isOverridable: true,
        overrideValue: undefined,
        value: undefined,
        enumValues: [],
      },
    ],
    [
      'choice',
      source,
      {
        isOverridable: false,
        overrideValue: undefined,
        value: 'a',
        enumValues,
      },
    ],
    [
      'many',
      source,
      {
        isOverridable: false,
        overrideValue: undefined,
        value: ['x', 'y'],
        enumValues: [],
      },
    ],
  ])('maps field %s', (key, card, expected) => {
    const index = cardType.customFields.findIndex((f) => f.name === key);
    expect(field(card, key)).toMatchObject({
      key,
      index,
      visibility: 'always',
      fieldDisplayName: `Display ${key}`,
      fieldDescription: `About ${key}`,
      ...expected,
    });
  });

  it.each([
    ['a field type is not loaded', source, fieldTypes.slice(1)],
    [
      'the source has no metadata',
      { ...source, metadata: undefined },
      fieldTypes,
    ],
  ])('returns null when %s', (_, card, types) => {
    expect(templateCardView(card as Card, cardType, types)).toBeNull();
  });

  it('fills the non-field keys from the source', () => {
    const view = templateCardView(source, cardType, fieldTypes);
    expect(view).toMatchObject({
      key: 'c1',
      title: 'T',
      cardType: 'ct',
      cardTypeDisplayName: 'ct',
      rank: '0|a',
      labels: ['l'],
      workflowState: '',
      links: [],
      notifications: [],
      policyChecks: { successes: [], failures: [] },
      deniedOperations: {
        transition: [],
        move: [],
        delete: [],
        editField: [],
        editContent: [],
      },
      rawContent: '== Body',
      adocContent: '',
      attachments: [],
      path: '/p/c1',
    });
  });
});
