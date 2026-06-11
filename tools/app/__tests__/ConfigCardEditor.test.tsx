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
import { render, screen, fireEvent, within } from '@testing-library/react';
import type * as Utils from '@/lib/utils';
import type * as HooksUtils from '@/lib/hooks/utils';

// Regression coverage for INTDEV-1312: the dedicated, edit-first template card
// editor. A single working draft is the source of truth, so every field is
// editable on load, each saves independently, Cancel reverts a field, and the
// Preview reflects the current (unsaved) draft.

// Heavy / peripheral pieces are stubbed; the metadata field rows (EditableField
// + FieldEditor) render for real so we exercise real editing behavior.
vi.mock('@uiw/react-codemirror', () => ({ default: () => null }));
vi.mock('@/components/AsciiDocToolbar', () => ({ default: () => null }));
vi.mock('@/components/LabelEditor', () => ({ default: () => null }));
vi.mock('@/components/toolbar/CardToolbar', () => ({ default: () => null }));
vi.mock('@/components/card/AttachmentPanel', () => ({
  AttachmentPanel: () => null,
}));

// Preview renders through the shared CardLayout (read-only). Mock it and
// capture the previewCard it receives.
let previewTitle: unknown;
let previewCardArg: { fields?: { key: string; value: unknown }[] } | undefined;
vi.mock('@/components/card/CardLayout', () => ({
  CardLayout: (props: {
    card: { title: unknown; fields?: { key: string; value: unknown }[] };
  }) => {
    previewTitle = props.card.title;
    previewCardArg = props.card;
    return null;
  },
}));

const updateCard = vi.fn().mockResolvedValue(undefined);
const useRawCard = vi.fn();
vi.mock('@/lib/api', () => ({
  useRawCard: (...args: unknown[]) => useRawCard(...args),
  useResourceTree: () => ({ resourceTree: [] }),
  useCardMutations: () => ({ updateCard }),
}));

vi.mock('@/lib/hooks', async () => {
  const utils = await vi.importActual<typeof HooksUtils>('@/lib/hooks/utils');
  return {
    useAppRouter: () => ({ push: vi.fn() }),
    useAppDispatch: () => vi.fn(),
    useIsDarkMode: () => false,
    formKeyHandler: utils.formKeyHandler,
  };
});

vi.mock('@/lib/auth', () => ({
  UserRole: { Reader: 0, Editor: 1, Admin: 2 },
  useHasMinRole: () => true,
}));

vi.mock('@/lib/api/actions/card', () => ({
  parseContent: vi.fn().mockResolvedValue('<p>html</p>'),
}));

vi.mock('@/lib/utils', async (orig) => ({
  ...(await orig<typeof Utils>()),
  getConfig: () => ({ staticMode: false }),
  findCardParentInResourceTree: () => null,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (s: string) => s }),
}));

import { ConfigCardEditor } from '@/components/config-editors/ConfigCardEditor';

const baseCard = {
  key: 'c1',
  title: 'A template card',
  labels: [],
  rawContent: '== Body',
  parsedContent: '<h2>Body</h2>',
  attachments: [],
  deniedOperations: { editField: [] },
  fields: [
    {
      key: 'f1',
      dataType: 'shortText',
      fieldDisplayName: 'Short text',
      fieldDescription: '',
      enumValues: [],
      isCalculated: false,
      visibility: 'always',
      value: null,
    },
    {
      // Raw card endpoint returns list values as plain strings (not items).
      key: 'flist',
      dataType: 'list',
      fieldDisplayName: 'A list',
      fieldDescription: '',
      enumValues: [
        { enumValue: 'option1', enumDisplayValue: 'Option 1' },
        { enumValue: 'option2', enumDisplayValue: 'Option 2' },
      ],
      isCalculated: false,
      visibility: 'always',
      value: ['option1'],
    },
  ],
};

const renderEditor = (overrides?: Partial<typeof baseCard>, node?: object) => {
  useRawCard.mockReturnValue({
    card: { ...baseCard, ...overrides },
    isLoading: false,
    error: null,
  });
  return render(
    <ConfigCardEditor node={{ id: 'c1', readOnly: false, ...node } as never} />,
  );
};

const fieldInput = (container: HTMLElement, key: string) =>
  within(
    container.querySelector(`#metadata-field-${key}`) as HTMLElement,
  ).getByRole('textbox');

const rowButton = (container: HTMLElement, key: string, dataCy: string) =>
  container.querySelector(
    `#metadata-field-${key} [data-cy="${dataCy}"]`,
  ) as HTMLButtonElement;

describe('ConfigCardEditor (template card editor)', () => {
  beforeEach(() => {
    updateCard.mockClear();
    previewTitle = undefined;
    previewCardArg = undefined;
  });

  it('is edit-first: custom fields are open inputs and save independently', () => {
    const { container } = renderEditor();

    const input = fieldInput(container, 'f1');
    expect(input).toBeVisible();

    fireEvent.change(input, { target: { value: 'hello' } });

    const save = rowButton(container, 'f1', 'fieldSaveButton');
    expect(save).not.toBeDisabled();
    fireEvent.click(save);

    expect(updateCard).toHaveBeenCalledWith({ metadata: { f1: 'hello' } });
  });

  it('cancel reverts the field to its saved value', () => {
    const { container } = renderEditor();
    const input = fieldInput(container, 'f1') as HTMLInputElement;

    fireEvent.change(input, { target: { value: 'temp' } });
    expect(input.value).toBe('temp');

    fireEvent.click(rowButton(container, 'f1', 'fieldCancelButton'));

    expect((fieldInput(container, 'f1') as HTMLInputElement).value).toBe('');
    expect(updateCard).not.toHaveBeenCalled();
  });

  it('saves the title via keyboard (Enter and Ctrl+S)', () => {
    const { container } = renderEditor();
    const title = within(
      container.querySelector('#card-title-editor') as HTMLElement,
    ).getByRole('textbox');

    fireEvent.change(title, { target: { value: 'Saved via Enter' } });
    fireEvent.keyDown(title, { key: 'Enter' });
    expect(updateCard).toHaveBeenCalledWith({
      metadata: { title: 'Saved via Enter' },
    });

    updateCard.mockClear();
    fireEvent.change(title, { target: { value: 'Saved via Ctrl+S' } });
    fireEvent.keyDown(title, { key: 's', ctrlKey: true });
    expect(updateCard).toHaveBeenCalledWith({
      metadata: { title: 'Saved via Ctrl+S' },
    });
  });

  it('saves a metadata field via keyboard (Enter and Ctrl+S)', () => {
    const { container } = renderEditor();
    const input = fieldInput(container, 'f1');

    fireEvent.change(input, { target: { value: 'kbd enter' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(updateCard).toHaveBeenCalledWith({ metadata: { f1: 'kbd enter' } });

    updateCard.mockClear();
    fireEvent.change(input, { target: { value: 'kbd ctrl-s' } });
    fireEvent.keyDown(input, { key: 's', ctrlKey: true });
    expect(updateCard).toHaveBeenCalledWith({ metadata: { f1: 'kbd ctrl-s' } });
  });

  it('Escape reverts a dirty field without saving', () => {
    const { container } = renderEditor();
    const input = fieldInput(container, 'f1') as HTMLInputElement;

    fireEvent.change(input, { target: { value: 'temp' } });
    expect(input.value).toBe('temp');

    fireEvent.keyDown(input, { key: 'Escape' });

    expect((fieldInput(container, 'f1') as HTMLInputElement).value).toBe('');
    expect(updateCard).not.toHaveBeenCalled();
  });

  it('Preview reflects the current unsaved draft (title + field)', () => {
    const { container } = renderEditor();

    const title = within(
      container.querySelector('#card-title-editor') as HTMLElement,
    ).getByRole('textbox');
    fireEvent.change(title, { target: { value: 'Unsaved title' } });

    const field = fieldInput(container, 'f1');
    fireEvent.change(field, { target: { value: 'draft value' } });

    fireEvent.click(screen.getByRole('button', { name: 'preview' }));

    expect(previewTitle).toBe('Unsaved title');
    expect(previewCardArg?.fields?.find((f) => f.key === 'f1')?.value).toBe(
      'draft value',
    );
  });

  it('preserves list field values in the draft/preview (not corrupted)', () => {
    const { container } = renderEditor();

    // A list field is not falsely dirty on load.
    expect(rowButton(container, 'flist', 'fieldSaveButton')).toBeDisabled();

    // ...and its value survives intact into the preview (regression: it used
    // to become [undefined] for raw string-array list values).
    fireEvent.click(screen.getByRole('button', { name: 'preview' }));
    expect(
      previewCardArg?.fields?.find((f) => f.key === 'flist')?.value,
    ).toEqual(['option1']);
  });

  it('renders the title as an edit-first input, separate from the metadata box', () => {
    const { container } = renderEditor();
    // Title is its own editor, not a metadata-field row.
    expect(container.querySelector('#metadata-field-__title__')).toBeNull();
    const titleEditor = container.querySelector(
      '#card-title-editor',
    ) as HTMLElement;
    expect(titleEditor).not.toBeNull();
    // Open input on load (edit-first).
    expect(within(titleEditor).getByRole('textbox')).toBeVisible();
    // ...and it lives outside the metadata box.
    expect(
      container
        .querySelector('[data-cy="metadataView"]')
        ?.contains(titleEditor),
    ).toBe(false);
  });

  it('is read-only for a read-only node (no save controls)', () => {
    const { container } = renderEditor(undefined, { readOnly: true });
    expect(container.querySelector('[data-cy="fieldSaveButton"]')).toBeNull();
  });
});
