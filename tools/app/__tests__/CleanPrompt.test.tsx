/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import type { CleanResult } from '@cyberismo/data-handler';

const update = vi.fn().mockResolvedValue(undefined);
const cleanProject = vi.fn();

vi.mock('@/lib/api', () => ({
  useResource: () => ({ update, isUpdating: () => false }),
  useCardTypeMutations: () => ({
    updateFieldVisibility: vi.fn(),
    isUpdating: () => false,
  }),
  cleanProject: (dryRun: boolean) => cleanProject(dryRun),
}));

import rootReducer from '@/lib/slices';
import { CardTypeFieldsEditor } from '@/components/config-editors/fields/CardTypeFieldsEditor';
import { CleanPrompt } from '@/components/CleanPrompt';

let store: ReturnType<typeof configureStore>;

const fieldName = 'base/fieldTypes/owner';

const customField = (
  overrides?: Partial<{ isCalculated: boolean; enableOverride: boolean }>,
) => ({
  name: fieldName,
  displayName: 'Owner',
  isCalculated: false,
  enableOverride: false,
  ...overrides,
});

const cardType = (field: ReturnType<typeof customField>) => ({
  name: 'base/cardTypes/page',
  displayName: 'Page',
  workflow: 'base/workflows/default',
  customFields: [field],
  alwaysVisibleFields: [fieldName],
  optionallyVisibleFields: [],
});

const oneFinding: CleanResult = {
  findings: [{ cardKey: 'TST_1', field: fieldName, reason: 'undeclared' }],
  cardCount: 1,
  skippedCards: [],
  failedCards: [],
  dryRun: true,
};

const noFindings: CleanResult = {
  findings: [],
  cardCount: 0,
  skippedCards: [],
  failedCards: [],
  dryRun: true,
};

// Cards that could not be written are a subset of the cards that had findings.
const partialFailure: CleanResult = {
  findings: ['TST_1', 'TST_2', 'TST_3'].map((cardKey) => ({
    cardKey,
    field: fieldName,
    reason: 'undeclared' as const,
  })),
  cardCount: 3,
  skippedCards: [],
  failedCards: ['TST_2', 'TST_3'],
  dryRun: false,
};

// CleanPrompt stands in for the app shell: it renders the prompt for whichever
// edit asked for one, and outlives a caller that navigates away.
const renderEditor = (field = customField()) =>
  render(
    <Provider store={store}>
      <CardTypeFieldsEditor
        cardType={cardType(field) as never}
        resourceTree={[]}
      />
      <CleanPrompt />
    </Provider>,
  );

const iconButton = (icon: string) =>
  screen.getByTestId(icon).closest('button') as HTMLButtonElement;

// A checked Joy checkbox renders a check icon of its own, so the save button is
// the only check icon that sits inside a button.
const saveRowButton = () =>
  screen
    .getAllByTestId('CheckIcon')
    .map((icon) => icon.closest('button'))
    .find((button) => button !== null) as HTMLButtonElement;

const enabledCheckboxes = () =>
  screen
    .getAllByRole('checkbox')
    .filter((box) => !(box as HTMLInputElement).disabled);

const deleteField = () => {
  fireEvent.click(iconButton('DeleteIcon'));
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
};

const notifications = () =>
  (
    store.getState() as {
      notifications: { notifications: { message: string; type: string }[] };
    }
  ).notifications.notifications.map(({ message, type }) => ({ message, type }));

// Reports one finding, then leaves the real clean in flight until finishClean().
const mockDeferredClean = () => {
  let finishClean = () => {};
  cleanProject.mockResolvedValueOnce(oneFinding).mockReturnValueOnce(
    new Promise((resolve) => {
      finishClean = () => resolve({ ...oneFinding, dryRun: false });
    }),
  );
  return { finishClean: () => finishClean() };
};

describe('clean prompt after card type field changes', () => {
  beforeEach(() => {
    update.mockClear();
    cleanProject.mockReset();
    store = configureStore({ reducer: rootReducer });
  });

  it('offers to remove the unused values found after deleting a field', async () => {
    cleanProject.mockResolvedValue(oneFinding);
    renderEditor();

    deleteField();

    expect(
      await screen.findByText('Unused field values in this project'),
    ).toBeInTheDocument();
    expect(cleanProject).toHaveBeenNthCalledWith(1, true);
    expect(
      screen.getByText(
        /1 field value on 1 card that its card type no longer uses/,
      ),
    ).toBeInTheDocument();

    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(cleanProject).toHaveBeenNthCalledWith(2, false));
    await waitFor(() =>
      expect(
        screen.queryByText('Unused field values in this project'),
      ).not.toBeInTheDocument(),
    );
    expect(notifications()).toContainEqual({
      message: 'Unused field values removed',
      type: 'success',
    });
  });

  it('warns instead of reporting success when some cards could not be updated', async () => {
    cleanProject
      .mockResolvedValueOnce({ ...partialFailure, dryRun: true })
      .mockResolvedValueOnce(partialFailure);
    renderEditor();

    deleteField();

    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));

    await waitFor(() =>
      expect(notifications()).toContainEqual({
        message:
          'Unused field values removed, but 2 cards could not be updated',
        type: 'warning',
      }),
    );
    expect(notifications()).not.toContainEqual({
      message: 'Unused field values removed',
      type: 'success',
    });
    expect(
      screen.queryByText('Unused field values in this project'),
    ).not.toBeInTheDocument();
  });

  it('reports an error and closes the prompt when the clean fails', async () => {
    cleanProject
      .mockResolvedValueOnce(oneFinding)
      .mockRejectedValueOnce(new Error('clean failed'));
    renderEditor();

    deleteField();

    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));

    await waitFor(() =>
      expect(notifications()).toContainEqual({
        message: 'clean failed',
        type: 'error',
      }),
    );
    expect(
      screen.queryByText('Unused field values in this project'),
    ).not.toBeInTheDocument();
  });

  // 'cleaning' gates both the confirm button and the close handler, so a second
  // confirm and a cancel mid-clean must both be ignored.
  it('ignores a second confirm and a cancel while the clean runs', async () => {
    const { finishClean } = mockDeferredClean();
    renderEditor();

    deleteField();

    const remove = await screen.findByRole('button', { name: 'Remove' });
    fireEvent.click(remove);
    fireEvent.click(remove);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(
      screen.getByText('Unused field values in this project'),
    ).toBeInTheDocument();

    finishClean();
    await waitFor(() => expect(cleanProject).toHaveBeenCalledTimes(2));
    expect(cleanProject.mock.calls).toEqual([[true], [false]]);
    await waitFor(() =>
      expect(
        screen.queryByText('Unused field values in this project'),
      ).not.toBeInTheDocument(),
    );
  });

  it('does not prompt when the scan finds nothing', async () => {
    cleanProject.mockResolvedValue(noFindings);
    renderEditor();

    deleteField();

    await waitFor(() => expect(cleanProject).toHaveBeenCalledWith(true));
    expect(
      screen.queryByText('Unused field values in this project'),
    ).not.toBeInTheDocument();
  });

  it('keeps the edit flow working when the scan fails', async () => {
    cleanProject.mockRejectedValue(new Error('scan failed'));
    renderEditor();

    deleteField();

    await waitFor(() => expect(cleanProject).toHaveBeenCalledWith(true));
    expect(update).toHaveBeenCalled();
    expect(
      screen.queryByText('Unused field values in this project'),
    ).not.toBeInTheDocument();
  });

  it('offers to remove the unused values after a field becomes calculated', async () => {
    cleanProject.mockResolvedValue(oneFinding);
    renderEditor();

    fireEvent.click(iconButton('EditIcon'));

    const [isCalculated] = enabledCheckboxes();
    expect(enabledCheckboxes()).toHaveLength(1);
    fireEvent.click(isCalculated);

    fireEvent.click(saveRowButton());

    expect(
      await screen.findByText('Unused field values in this project'),
    ).toBeInTheDocument();
    expect(cleanProject).toHaveBeenCalledWith(true);
  });

  it('offers to remove the unused values after override is disabled', async () => {
    cleanProject.mockResolvedValue(oneFinding);
    renderEditor(customField({ isCalculated: true, enableOverride: true }));

    fireEvent.click(iconButton('EditIcon'));

    // Both row checkboxes are editable while the field stays calculated.
    const [, enableOverride] = enabledCheckboxes();
    expect(enabledCheckboxes()).toHaveLength(2);
    fireEvent.click(enableOverride);

    fireEvent.click(saveRowButton());

    expect(
      await screen.findByText('Unused field values in this project'),
    ).toBeInTheDocument();
    expect(cleanProject).toHaveBeenCalledWith(true);
  });

  it('does not scan when only the display name changes', async () => {
    cleanProject.mockResolvedValue(oneFinding);
    renderEditor();

    fireEvent.click(iconButton('EditIcon'));

    const [displayName] = screen
      .getAllByRole('textbox')
      .filter((input) => !(input as HTMLInputElement).disabled);
    fireEvent.change(displayName, { target: { value: 'Responsible' } });

    fireEvent.click(saveRowButton());

    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(cleanProject).not.toHaveBeenCalled();
  });
});
