// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from 'vitest';
import type { Card, CardType, FieldType } from '@cyberismo/model';
import { templateCardView } from '@/components/config-editors/template-card/source-view';

const enumValues = [{ enumValue: 'a', enumDisplayValue: 'A' }];

const fieldTypes = [
  ['calc', 'shortText'],
  ['over', 'shortText'],
  ['choice', 'enum'],
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
    { name: 'calc', isCalculated: true },
    { name: 'over', isCalculated: true, enableOverride: true },
    { name: 'choice' },
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
    calc: 'stored',
    over: 'stored',
    choice: 'a',
  },
} as unknown as Card;

const field = (card: Card, key: string) =>
  templateCardView(card, cardType, fieldTypes)?.fields.find(
    (f) => f.key === key,
  );

describe('templateCardView', () => {
  it.each([
    [
      'calc',
      source,
      {
        isCalculated: true,
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
        isCalculated: true,
        isOverridable: true,
        overrideValue: 'stored',
        value: 'stored',
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

  it('falls back to empty values for a sparse source', () => {
    const sparse = {
      key: 'c2',
      path: '/p/c2',
      content: undefined,
      attachments: [{ fileName: 'a.png' }],
      metadata: { rank: '0|b' },
    } as unknown as Card;
    expect(templateCardView(sparse, cardType, [])).toBeNull();
    const view = templateCardView(
      sparse,
      { name: 'ct', customFields: [] } as unknown as CardType,
      [],
    );
    expect(view).toMatchObject({
      key: 'c2',
      title: '',
      cardType: '',
      labels: [],
      rawContent: '',
      attachments: [{ fileName: 'a.png' }],
      path: '/p/c2',
    });
  });

  it('passes the stored body, title and labels through', () => {
    expect(templateCardView(source, cardType, fieldTypes)).toMatchObject({
      title: 'T',
      cardType: 'ct',
      labels: ['l'],
      rawContent: '== Body',
    });
  });
});
