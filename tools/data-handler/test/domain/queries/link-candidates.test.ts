// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { expect, test } from 'vitest';
import { toLinkCandidates } from '../../../src/domain/queries/link-candidates.js';

test('toLinkCandidates maps rows by shape', () => {
  expect(
    toLinkCandidates([
      { key: 'a_1', title: 'A', cardType: 'p/cardTypes/t' },
      { key: 'x', connector: 'jira', itemKey: 'J-1', title: 'Issue' },
      { key: 'y', connector: 'jira', itemKey: 'J-2' },
      { key: 'z', connector: 'jira' },
      { key: 'b_2', cardType: 'p/cardTypes/t' },
      { key: 'c_3', title: '', cardType: 'p/cardTypes/t' },
      { key: 'jira', type: 'connector', displayName: 'Jira' },
      { key: 'a_1', title: 'Again', cardType: 'p/cardTypes/t' },
    ]),
  ).toEqual([
    { key: 'a_1', kind: 'card', title: 'A', cardType: 'p/cardTypes/t' },
    {
      key: 'jira:J-1',
      kind: 'external',
      title: 'Issue',
      connector: 'jira',
      itemKey: 'J-1',
    },
    {
      key: 'jira:J-2',
      kind: 'external',
      title: 'jira:J-2',
      connector: 'jira',
      itemKey: 'J-2',
    },
    { key: 'b_2', kind: 'card', title: 'b_2', cardType: 'p/cardTypes/t' },
    { key: 'c_3', kind: 'card', title: 'c_3', cardType: 'p/cardTypes/t' },
  ]);
});
