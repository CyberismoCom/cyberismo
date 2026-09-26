import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter, Route, Routes } from 'react-router';
import type * as AppHooks from '@/lib/hooks';

const markCardReviewed = vi.fn().mockResolvedValue(undefined);
const revertCard = vi.fn().mockResolvedValue(undefined);
const mergeChangeSet = vi.fn().mockResolvedValue({});
const updateChangeSet = vi.fn();
const discardChangeSet = vi.fn().mockResolvedValue(undefined);
const routerPush = vi.fn();
let activeId: string | null = 'cs1';
let onlyResources = false;

const card = (overrides: Record<string, unknown>) => ({
  kind: 'modified',
  title: 'A card',
  path: 'cardRoot/TST_1',
  fields: [],
  contentChanged: false,
  reordered: false,
  links: { added: [], removed: [] },
  attachments: { added: [], removed: [] },
  commits: [],
  reviewed: false,
  ...overrides,
});

vi.mock('@/lib/api/changesets', () => ({
  useActiveChangeSet: () => ({
    id: activeId,
    changeSet: activeId
      ? { id: activeId, title: 'Agent pass', owner: { name: 'Alice' } }
      : undefined,
  }),
  useChangeSetChanges: () => ({
    isLoading: false,
    changes: onlyResources
      ? {
          base: 'b',
          head: 'h',
          cards: [],
          resources: [{ status: 'M', path: '.cards/local/cardsConfig.json' }],
        }
      : {
          base: 'b',
          head: 'h',
          resources: [],
          cards: [
            card({
              key: 'TST_1',
              title: 'Retitled',
              fields: [{ field: 'title', before: 'Old', after: 'Retitled' }],
              commits: [
                {
                  hash: '1',
                  subject: 's',
                  date: 'd',
                  author: { name: 'Alice', email: 'a@x' },
                  actor: 'agent',
                  agent: 'claude',
                },
              ],
            }),
            card({
              key: 'TST_2',
              kind: 'created',
              title: 'New',
              reviewed: true,
            }),
          ],
        },
  }),
  useCardDiff: () => ({ isLoading: true }),
  markCardReviewed: (...args: unknown[]) => markCardReviewed(...args),
  revertCard: (...args: unknown[]) => revertCard(...args),
  mergeChangeSet: (...args: unknown[]) => mergeChangeSet(...args),
  updateChangeSet: (...args: unknown[]) => updateChangeSet(...args),
  discardChangeSet: (...args: unknown[]) => discardChangeSet(...args),
}));

vi.mock('@/lib/auth', () => ({
  UserRole: { Editor: 'editor' },
  useHasMinRole: () => true,
}));

vi.mock('@/lib/hooks', async () => {
  const actual = await vi.importActual<typeof AppHooks>('@/lib/hooks');
  return { ...actual, useAppRouter: () => ({ push: routerPush }) };
});

import rootReducer from '@/lib/slices';
import { setLastPathForPrefix } from '@/lib/slices/project';
import ChangeSetReviewPage from '@/pages/changeset/review';

function renderPage(lastPath?: string) {
  const store = configureStore({ reducer: rootReducer });
  if (lastPath) {
    store.dispatch(setLastPathForPrefix({ prefix: 'TST', path: lastPath }));
  }
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/projects/TST/changeset']}>
        <Routes>
          <Route
            path="/projects/:projectPrefix/changeset"
            element={<ChangeSetReviewPage />}
          />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
}

describe('ChangeSetReviewPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    activeId = 'cs1';
    onlyResources = false;
  });

  it('lists the changed cards, who changed them and what is reviewed', () => {
    renderPage();
    expect(screen.getByText('Agent pass')).toBeInTheDocument();
    expect(
      screen.getByText('Started by Alice · 2 cards changed · 1 not reviewed'),
    ).toBeInTheDocument();
    expect(screen.getByText('Retitled')).toBeInTheDocument();
    expect(screen.getByText('title')).toBeInTheDocument();
    expect(screen.getByText('claude')).toBeInTheDocument();
    const boxes = screen.getAllByRole('checkbox', { name: 'Reviewed' });
    expect(boxes.map((box) => (box as HTMLInputElement).checked)).toEqual([
      false,
      true,
    ]);
  });

  it('marks cards reviewed and reverts them', async () => {
    renderPage();
    fireEvent.click(screen.getAllByRole('checkbox', { name: 'Reviewed' })[0]);
    await waitFor(() =>
      expect(markCardReviewed).toHaveBeenCalledWith(
        'TST',
        'cs1',
        'TST_1',
        true,
      ),
    );
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Undo changes to this card' })[1],
    );
    await waitFor(() =>
      expect(revertCard).toHaveBeenCalledWith('TST', 'cs1', 'TST_2'),
    );
  });

  it('warns about unreviewed cards before merging', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Merge' }));
    expect(
      screen.getByText('1 card is not reviewed yet. Merge anyway?'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Merge' }).at(-1)!);
    await waitFor(() =>
      expect(mergeChangeSet).toHaveBeenCalledWith('TST', 'cs1'),
    );
    expect(routerPush).toHaveBeenCalledWith('/projects/TST/cards');
  });

  it('returns to the card viewed last once merged', async () => {
    renderPage('/cards/TST_1');
    fireEvent.click(screen.getByRole('button', { name: 'Merge' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Merge' }).at(-1)!);
    await waitFor(() =>
      expect(routerPush).toHaveBeenCalledWith('/projects/TST/cards/TST_1'),
    );
  });

  it('returns to the card list when the last card went with the changeset', async () => {
    // TST_2 was created in the changeset: discarding it removes the card
    renderPage('/cards/TST_2');
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Discard' }).at(-1)!);
    await waitFor(() =>
      expect(routerPush).toHaveBeenCalledWith('/projects/TST/cards'),
    );
  });

  it('asks how to settle conflicts, then updates with the choices', async () => {
    updateChangeSet
      .mockResolvedValueOnce({
        updated: false,
        conflicts: [
          {
            path: 'cardRoot/TST_1/index.adoc',
            key: 'TST_1',
            base: 'a',
            ours: 'b',
            theirs: 'c',
          },
        ],
      })
      .mockResolvedValueOnce({ updated: true, conflicts: [] });
    renderPage();
    fireEvent.click(
      screen.getByRole('button', { name: 'Update from project' }),
    );
    await screen.findByText('Settle conflicts');
    fireEvent.click(screen.getByLabelText("Take the project's version"));
    fireEvent.click(screen.getByRole('button', { name: 'Update' }));
    await waitFor(() =>
      expect(updateChangeSet).toHaveBeenLastCalledWith('TST', 'cs1', {
        'cardRoot/TST_1/index.adoc': 'theirs',
      }),
    );
    await waitFor(() =>
      expect(screen.queryByText('Settle conflicts')).not.toBeInTheDocument(),
    );
  });

  it('opens a card’s changes from the keyboard', () => {
    renderPage();
    const toggle = screen.getByRole('button', {
      name: 'Show changes to Retitled',
    });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    toggle.focus();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  it('can merge a changeset that changes only configuration', () => {
    onlyResources = true;
    renderPage();
    expect(
      screen.getByText('.cards/local/cardsConfig.json', { exact: false }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Merge' })).toBeEnabled();
  });

  it('says so when no changeSet is active', () => {
    activeId = null;
    renderPage();
    expect(
      screen.getByText(
        'You are not working in a changeset. Start one from the project menu.',
      ),
    ).toBeInTheDocument();
  });
});
