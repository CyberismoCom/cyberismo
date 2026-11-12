// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router';
import type { CalculationLink } from '@cyberismo/model';
import { LinkRow } from '@/components/card/linked-cards-section/LinkRow';

const link: CalculationLink = {
  displayName: 'relates to',
  key: 'test_other',
  linkType: 'test/linkTypes/relates',
  title: 'Other',
  direction: 'outbound',
  linkSource: 'user',
};

describe('LinkRow', () => {
  it.each([
    { exported: undefined, anchor: '/cards/test_other' },
    { exported: true, anchor: '/cards/test_other' },
    { exported: false, anchor: null },
  ])(
    'with exported $exported, links the card key: $anchor',
    ({ exported, anchor }) => {
      render(
        <MemoryRouter>
          <LinkRow link={link} exported={exported} />
        </MemoryRouter>,
      );

      const key = screen.getByText('test_other');
      expect(key.closest('a')?.getAttribute('href') ?? null).toBe(anchor);
      expect(screen.getByText('Other')).toBeInTheDocument();
    },
  );
});
