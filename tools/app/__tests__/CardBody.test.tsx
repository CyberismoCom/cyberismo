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

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

let lastCodeMirrorProps: Record<string, unknown> | undefined;
vi.mock('@uiw/react-codemirror', () => ({
  default: (props: Record<string, unknown>) => {
    lastCodeMirrorProps = props;
    return <textarea data-cy="cmMock" />;
  },
}));
vi.mock('@/components/AsciiDocToolbar', () => ({ default: () => null }));
vi.mock('@/lib/hooks', () => ({
  useAppDispatch: () => vi.fn(),
  useAppSelector: () => null,
}));
// CardBody imports useIsDarkMode from '@/lib/hooks/theme' directly (not via
// the '@/lib/hooks' index), and the real hook calls Joy's useColorScheme,
// which throws outside a CssVarsProvider — mock the exact specifier.
vi.mock('@/lib/hooks/theme', () => ({
  useIsDarkMode: () => false,
}));
vi.mock('@/lib/auth', () => ({
  UserRole: { Reader: 0, Editor: 1, Admin: 2 },
  useHasMinRole: () => true,
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (s: string) => s }),
}));

import { CardBody } from '@/components/card/CardBody';

const baseCard = {
  key: 'card1',
  title: 'A card',
  rawContent: 'Body text',
  parsedContent: '<p>Body text</p>',
  attachments: [],
};

describe('CardBody', () => {
  it('does not cap the editing CodeMirror height (no nested scroll container)', () => {
    const { container } = render(
      <CardBody card={baseCard as never} onContentSave={vi.fn()} />,
    );

    fireEvent.click(container.querySelector('[data-cy="editBodyButton"]')!);

    expect(lastCodeMirrorProps?.maxHeight).toBeUndefined();
  });

  it('pins the editing toolbar/actions row so Save/Cancel stay visible while scrolling', () => {
    const { container } = render(
      <CardBody card={baseCard as never} onContentSave={vi.fn()} />,
    );

    fireEvent.click(container.querySelector('[data-cy="editBodyButton"]')!);

    const saveButton = container.querySelector(
      '[data-cy="contentSaveButton"]',
    )!;
    // Walk the ancestor chain and assert some ancestor computes to
    // position: sticky. (Don't use `closest('[class*="css-"]')` — that
    // matches the Button itself, whose position is static, not the grid
    // Box that carries the sticky sx. Joy's sx compiles to an emotion
    // class, so inline-style selectors can't find it either.)
    let node: Element | null = saveButton;
    let foundSticky = false;
    while (node) {
      if (getComputedStyle(node).position === 'sticky') {
        foundSticky = true;
        break;
      }
      node = node.parentElement;
    }
    expect(foundSticky).toBe(true);
  });
});
