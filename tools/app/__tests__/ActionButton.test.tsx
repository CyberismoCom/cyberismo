// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom';

const dispatch = vi.fn();
const runAction = vi.fn();
let canEdit = true;
let prefix: string | null = 'p';

// useCardMutations, with its 'action' loading state kept in the component.
vi.mock('@/lib/api', async () => {
  const { useState } = await import('react');
  return {
    useCardMutations: (key: string) => {
      const [running, setRunning] = useState(false);
      return {
        isUpdating: (action?: string) => action === 'action' && running,
        runAction: async (programs: string[]) => {
          setRunning(true);
          try {
            return await runAction(key, programs);
          } finally {
            setRunning(false);
          }
        },
      };
    },
    ActionLostError: class extends Error {
      constructor(readonly refreshed: boolean) {
        super('lost');
      }
    },
  };
});
vi.mock('@/lib/swr', () => ({
  ApiCallError: class extends Error {
    constructor(
      readonly response: Response,
      reason?: string,
      readonly details?: Record<string, unknown>,
    ) {
      super(reason);
    }
  },
}));
vi.mock('@/lib/auth', () => ({
  UserRole: { Reader: 0, Editor: 1, Admin: 2 },
  useHasMinRole: () => canEdit,
}));
vi.mock('@/lib/hooks', () => ({
  useAppDispatch: () => dispatch,
  useAppSelector: () => prefix,
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (s: string, options?: { count?: number; reason?: string }) => {
      const value = options?.count ?? options?.reason;
      return value === undefined ? s : `${s}:${value}`;
    },
  }),
}));

import Action from '@/components/macros/Action';
import { ActionLostError } from '@/lib/api';
import { ApiCallError } from '@/lib/swr';

const PROGRAMS = ['transition(p_1, "Approve").', 'a.'];

const renderButton = (preview = false) =>
  render(
    <Action
      buttonLabel="Approve"
      cardKey="p_1"
      programs={PROGRAMS}
      macroKey="p_1"
      preview={preview}
    />,
  );
const button = () => screen.getByRole('button', { name: 'Approve' });
// The notifications dispatched, without the other actions.
const notifications = () =>
  dispatch.mock.calls
    .map(([action]) => action)
    .filter((action) => action.type === 'notifications/addNotification')
    .map(({ payload: { message, type, links, more } }) => ({
      message,
      type,
      ...(links && { links }),
      ...(more && { more }),
    }));

beforeEach(() => {
  canEdit = true;
  prefix = 'p';
  dispatch.mockReset();
  runAction.mockReset();
});

describe('Action', () => {
  it('posts the programs and lists created cards as links', async () => {
    const created = Array.from({ length: 12 }, (_, i) => ({
      key: `p_${i + 10}`,
      title: i === 0 ? '' : `Card ${i}`,
    }));
    runAction.mockResolvedValue({ created });
    renderButton();
    fireEvent.click(button());

    await waitFor(() => expect(notifications()).toHaveLength(1));
    expect(runAction).toHaveBeenCalledWith('p_1', PROGRAMS);
    const [toast] = notifications();
    expect(toast).toMatchObject({
      message: 'action.created:12',
      type: 'success',
      more: 'action.more:2',
    });
    // The first ten, in creation order; a card without a title shows its key
    expect(toast.links).toEqual(
      created.slice(0, 10).map(({ key, title }) => ({
        label: title || key,
        href: `/projects/p/cards/${key}`,
      })),
    );
  });

  it('says the action ran when no card was created', async () => {
    runAction.mockResolvedValue({ created: [] });
    renderButton();
    fireEvent.click(button());

    await waitFor(() =>
      expect(notifications()).toEqual([
        { message: 'action.ran', type: 'success' },
      ]),
    );
  });

  it('ignores clicks while running', async () => {
    let finish: (value: unknown) => void = () => {};
    runAction.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderButton();
    fireEvent.click(button());
    expect(runAction).toHaveBeenCalledTimes(1);
    fireEvent.click(button());
    expect(runAction).toHaveBeenCalledTimes(1);

    await act(async () => finish({ created: [] }));
    await waitFor(() => expect(button()).toBeEnabled());
    fireEvent.click(button());
    expect(runAction).toHaveBeenCalledTimes(2);
  });

  it('shows the server message on failure', async () => {
    const message =
      'Action failed in program 2 at transition(p_2,"Approve"): no such transition.';
    runAction.mockRejectedValue(new Error(message));
    renderButton();
    fireEvent.click(button());

    await waitFor(() =>
      expect(notifications()).toEqual([{ message, type: 'error' }]),
    );
    // No longer loading
    await waitFor(() => expect(button()).toBeEnabled());
  });

  it.each<[string, Record<string, string>, string]>([
    ['with Retry-After', { 'Retry-After': '5' }, 'action.busyIn:5'],
    ['without Retry-After', {}, 'action.busy'],
  ])(
    'says only that the server is busy on 503 %s, before anything was applied',
    async (_, headers, message) => {
      runAction.mockRejectedValue(
        new ApiCallError(
          new Response(null, { status: 503, headers }),
          'The logic backend is busy.',
          { applied: false },
        ),
      );
      renderButton();
      fireEvent.click(button());

      await waitFor(() =>
        expect(notifications()).toEqual([{ message, type: 'error' }]),
      );
    },
  );

  // As when the write fails to complete.
  it('says that the changes may have been applied on 503 without details', async () => {
    runAction.mockRejectedValue(
      new ApiCallError(
        new Response(null, { status: 503, headers: { 'Retry-After': '5' } }),
        'Lost the programs',
      ),
    );
    renderButton();
    fireEvent.click(button());

    await waitFor(() =>
      expect(notifications()).toEqual([
        { message: 'action.maybeApplied:Lost the programs', type: 'error' },
      ]),
    );
  });

  it('shows the server message on 503 from a later program', async () => {
    const message =
      'Action failed in program 2: closed. Without autocommit, the changes of the earlier programs were kept.';
    runAction.mockRejectedValue(
      new ApiCallError(
        new Response(null, { status: 503, headers: { 'Retry-After': '5' } }),
        message,
        { program: 2 },
      ),
    );
    renderButton();
    fireEvent.click(button());

    await waitFor(() =>
      expect(notifications()).toEqual([{ message, type: 'error' }]),
    );
  });

  it.each([
    [true, 'action.lostRefreshed'],
    [false, 'action.lostNotRefreshed'],
  ])('says the answer was lost, refreshed: %s', async (refreshed, message) => {
    runAction.mockRejectedValue(new ActionLostError(refreshed));
    renderButton();
    fireEvent.click(button());

    await waitFor(() =>
      expect(notifications()).toEqual([{ message, type: 'error' }]),
    );
  });

  it('shows a toast and does not post in preview', () => {
    renderButton(true);
    fireEvent.click(button());

    expect(runAction).not.toHaveBeenCalled();
    expect(notifications()).toEqual([
      { message: 'action.preview', type: 'success' },
    ]);
  });

  it('is aria-disabled with the reason for readers', () => {
    canEdit = false;
    renderButton();
    expect(button()).toHaveAttribute('aria-disabled', 'true');
    expect(button()).toHaveAccessibleDescription('permissions.editorRequired');
    fireEvent.click(button());
    expect(runAction).not.toHaveBeenCalled();
    expect(notifications()).toEqual([]);
  });

  it('has no reason and is not disabled for editors', () => {
    renderButton();
    expect(button()).not.toHaveAttribute('aria-disabled');
    expect(button()).not.toHaveAccessibleDescription();
  });
});
