// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router';
import type { CalculationLink, QueryResult } from '@cyberismo/model';
import type { CardView } from '@/lib/api/types';
import type * as Utils from '@/lib/utils';

let staticMode = false;

vi.mock('@/lib/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof Utils>()),
  getConfig: () => ({ staticMode }),
}));
vi.mock('@/lib/api', () => ({
  useCard: () => ({ isUpdating: () => false }),
}));
vi.mock('@/lib/auth', () => ({
  UserRole: { Editor: 'editor' },
  useHasMinRole: () => false,
}));
vi.mock('@/lib/hooks/redux', () => ({
  useAppDispatch: () => vi.fn(),
  useAppSelector: (select: (state: unknown) => unknown) =>
    select({ page: { linkedCardsExpanded: true } }),
}));

const { default: LinkedCardsSection } =
  await import('@/components/card/linked-cards-section/LinkedCardsSection');

const link = (key: string, title: string): CalculationLink => ({
  displayName: 'relates to',
  key,
  linkType: 'test/linkTypes/relates',
  title,
  direction: 'outbound',
  linkSource: 'user',
});

// The tree holds Shown only; the card links to Shown and to Outside.
const cards = [
  { key: 'test_shown', children: [] },
] as unknown as QueryResult<'tree'>[];
const card = {
  key: 'test_card',
  links: [link('test_shown', 'Shown'), link('test_outside', 'Outside')],
} as unknown as CardView;

describe('LinkedCardsSection', () => {
  it.each([
    { staticMode: false, linked: ['test_shown', 'test_outside'] },
    { staticMode: true, linked: ['test_shown'] },
  ])(
    'with staticMode $staticMode, links the cards $linked',
    ({ staticMode: mode, linked }) => {
      staticMode = mode;
      render(
        <MemoryRouter>
          <LinkedCardsSection
            card={card}
            cards={cards}
            linkTypes={[]}
            linkFormState="hidden"
          />
        </MemoryRouter>,
      );

      expect(
        ['test_shown', 'test_outside'].filter((key) =>
          screen.getByText(key).closest('a'),
        ),
      ).toEqual(linked);
    },
  );
});
