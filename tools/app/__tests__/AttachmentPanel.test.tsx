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
import { render, screen, fireEvent, configure } from '@testing-library/react';
import '@testing-library/jest-dom';

let isEditor = false;
vi.mock('@/lib/auth', () => ({
  UserRole: { Reader: 0, Editor: 1, Admin: 2 },
  useHasMinRole: () => isEditor,
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (s: string) => s }),
}));
vi.mock('@/lib/api/attachments', () => ({
  useAttachments: () => ({ removeAttachment: vi.fn() }),
}));
vi.mock('@/lib/swr', () => ({
  projectApiPaths: () => ({
    attachment: (key: string, name: string) => `/a/${key}/${name}`,
  }),
}));
vi.mock('@/components/modals', () => ({ AddAttachmentModal: () => null }));

import { AttachmentPanel } from '@/components/card/AttachmentPanel';

configure({ testIdAttribute: 'data-cy' });

const file = {
  card: 'c_1',
  fileName: 'notes.txt',
  mimeType: 'text/plain',
  path: '/c_1/a/notes.txt',
};

describe('AttachmentPanel', () => {
  it.each([
    {
      name: 'reader, collapsed, no insert',
      editor: false,
      expanded: false,
      insert: false,
      expectVisible: false,
      add: false,
      del: false,
      ins: false,
    },
    {
      name: 'reader, expanded, no insert',
      editor: false,
      expanded: true,
      insert: false,
      expectVisible: true,
      add: false,
      del: false,
      ins: false,
    },
    {
      name: 'editor, expanded, insert offered',
      editor: true,
      expanded: true,
      insert: true,
      expectVisible: true,
      add: true,
      del: true,
      ins: true,
    },
    {
      name: 'editor, collapsed',
      editor: true,
      expanded: false,
      insert: true,
      expectVisible: false,
      add: true,
      del: true,
      ins: true,
    },
  ])('$name', ({ editor, expanded, insert, expectVisible, add, del, ins }) => {
    isEditor = editor;
    render(
      <AttachmentPanel
        cardKey="c_1"
        attachments={[file]}
        initialExpanded={expanded}
        onInsert={insert ? vi.fn() : undefined}
      />,
    );

    expect(screen.getByTestId('attachmentCountBadge')).toHaveTextContent('1');
    const name = screen.getByText('notes.txt');
    if (expectVisible) expect(name).toBeVisible();
    else expect(name).not.toBeVisible();
    // Controls are rendered even when collapsed, so presence is checked in the DOM.
    expect(!!screen.queryByTestId('addAttachmentButton')).toBe(add);
    expect(!!screen.queryByLabelText('delete')).toBe(del);
    expect(!!screen.queryByTestId('insertToContentButton')).toBe(ins);
  });

  it('toggles open on click', () => {
    isEditor = false;
    render(<AttachmentPanel cardKey="c_1" attachments={[file]} />);
    expect(screen.getByText('notes.txt')).not.toBeVisible();
    fireEvent.click(screen.getByText('attachments'));
    expect(screen.getByText('notes.txt')).toBeVisible();
  });

  it.each([
    { editor: false, rendered: false },
    { editor: true, rendered: true },
  ])(
    'with no attachments renders $rendered for editor=$editor',
    ({ editor, rendered }) => {
      isEditor = editor;
      render(<AttachmentPanel cardKey="c_1" attachments={[]} />);
      expect(!!screen.queryByText('attachments')).toBe(rendered);
    },
  );
});
