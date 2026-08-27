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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import type { FileNode } from '@/lib/api/types';

// Regression coverage for INTDEV-1368: a file resource saved elsewhere
// (another tab, another user, the CLI) arrives as a refetched resource tree
// while this editor is open on it.

// CodeMirror is replaced by a plain textarea so the content it is handed, and
// the content it hands back, are both observable.
vi.mock('@uiw/react-codemirror', () => ({
  default: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (v: string) => void;
  }) => (
    <textarea
      data-cy="codemirror"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));
vi.mock('@/components/toolbar/ConfigToolbar', () => ({
  default: ({ disabled }: { disabled?: boolean }) => (
    <button data-cy="configSave" disabled={disabled} />
  ),
}));
vi.mock('@/lib/api', () => ({
  useResource: () => ({
    update: vi.fn().mockResolvedValue(undefined),
    isUpdating: () => false,
  }),
}));
vi.mock('@/lib/hooks', () => ({
  useAppDispatch: () => vi.fn(),
  useIsDarkMode: () => false,
}));
vi.mock('@/lib/auth', () => ({
  UserRole: { Reader: 0, Editor: 1, Admin: 2 },
  useHasMinRole: () => true,
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (s: string) => s }),
}));

import { TextEditor } from '@/components/config-editors/TextEditor';

const nodeWith = (content: string) =>
  ({
    name: 'base/templates/page/index.adoc',
    type: 'file',
    fileName: 'index.adoc',
    resourceName: 'base/templates/page',
    readOnly: false,
    data: { content },
  }) as unknown as FileNode;

const editor = (container: HTMLElement) =>
  container.querySelector('[data-cy="codemirror"]') as HTMLTextAreaElement;
const saveButton = (container: HTMLElement) =>
  container.querySelector('[data-cy="configSave"]') as HTMLButtonElement;

describe('TextEditor on a save made elsewhere', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows the new content and does not report unsaved changes', () => {
    const { container, rerender } = render(
      <TextEditor node={nodeWith('= Original')} />,
    );

    rerender(<TextEditor node={nodeWith('= Edited elsewhere')} />);

    expect(editor(container).value).toBe('= Edited elsewhere');
    expect(saveButton(container)).toBeDisabled();
  });

  it('keeps unsaved typing, still dirty against the new content', () => {
    const { container, rerender } = render(
      <TextEditor node={nodeWith('= Original')} />,
    );

    fireEvent.change(editor(container), { target: { value: '= Typed here' } });

    rerender(<TextEditor node={nodeWith('= Edited elsewhere')} />);

    expect(editor(container).value).toBe('= Typed here');
    expect(saveButton(container)).not.toBeDisabled();
  });
});
