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
import type { LinkCandidate } from '@cyberismo/model';

const dispatch = vi.fn();
const createLink = vi.fn();
const defaultLinkTypes = [
  {
    name: 'm/linkTypes/l',
    sourceCardTypes: [],
    destinationCardTypes: [],
    enableLinkDescription: false,
  },
];
let linkTypesList: unknown[] | undefined = defaultLinkTypes;
type CardData = { cardType: string; links: unknown[] };
const defaultCard: CardData = { cardType: 'm/cardTypes/t', links: [] };
let cardData: CardData | undefined = defaultCard;
let canEdit = true;
let queryError: Error | undefined;
let cardError: Error | undefined;
let linkTypesError: Error | undefined;
let validating = false;
const defaultCandidates: LinkCandidate[] = [
  {
    key: 'jira:J-1',
    kind: 'external',
    title: 'Issue',
    connector: 'jira',
    itemKey: 'J-1',
  },
  { key: 'm_1', kind: 'card', title: 'First', cardType: 'm/cardTypes/t' },
  { key: 'm_2', kind: 'card', title: 'Second', cardType: 'm/cardTypes/t' },
];
let candidates = defaultCandidates;
const usedCard = vi.fn();

vi.mock('@/lib/api', () => ({
  useCard: (key: string) => {
    usedCard(key);
    return { card: cardData, error: cardError, createLink };
  },
  useLinkTypes: () => ({ linkTypes: linkTypesList, error: linkTypesError }),
  useLinkCandidates: () => ({
    candidates,
    error: queryError,
    isValidating: validating,
  }),
}));
vi.mock('@/lib/auth', () => ({
  UserRole: { Reader: 0, Editor: 1, Admin: 2 },
  useHasMinRole: () => canEdit,
}));
vi.mock('@/lib/hooks', () => ({ useAppDispatch: () => dispatch }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (s: string) => s }),
}));

import CreateLinks from '@/components/macros/CreateLinks';

const withDescriptions = [
  { ...defaultLinkTypes[0], enableLinkDescription: true },
];
const button = () =>
  screen.getByText('createLinks.buttonLabel').closest('button')!;
const renderMacro = (
  props: Partial<React.ComponentProps<typeof CreateLinks>> = {},
) =>
  render(
    <CreateLinks
      linkType="m/linkTypes/l"
      query="q"
      macroKey="m_0"
      preview={false}
      {...props}
    />,
  );
const open = () => fireEvent.click(button());

beforeEach(() => {
  linkTypesList = defaultLinkTypes;
  candidates = defaultCandidates;
  cardData = defaultCard;
  canEdit = true;
  queryError = undefined;
  cardError = undefined;
  linkTypesError = undefined;
  validating = false;
  dispatch.mockReset();
  usedCard.mockReset();
  createLink.mockReset();
  createLink.mockResolvedValue(undefined);
});

describe('CreateLinks', () => {
  it.each([
    ['some fail', ['m_2'], ['createLink.success', 'createLink.partialFailure']],
    ['all fail', ['m_1', 'm_2'], ['createLink.partialFailure']],
  ])(
    'reports failures and keeps the failed rows selected when %s',
    async (_, failing, expected) => {
      createLink.mockImplementation(async (target: string) => {
        if (failing.includes(target)) throw new Error('nope');
      });
      renderMacro();
      open();
      fireEvent.click(await screen.findByLabelText(/First/));
      fireEvent.click(screen.getByLabelText(/Second/));
      fireEvent.click(screen.getByText('createLinks.create'));

      await waitFor(() =>
        expect(dispatch).toHaveBeenCalledTimes(expected.length),
      );
      const messages = dispatch.mock.calls.map((c) => c[0].payload.message);
      expect(messages).toEqual(expected);
      expect(screen.getByLabelText(/Second/)).toBeChecked();
      expect(screen.getByLabelText<HTMLInputElement>(/First/).checked).toBe(
        failing.includes('m_1'),
      );
    },
  );

  it('creates inbound links to external items', async () => {
    renderMacro({ direction: 'inbound' });
    open();
    fireEvent.click(await screen.findByLabelText(/Issue/));
    // Ticked by mistake and unticked
    fireEvent.click(screen.getByLabelText(/First/));
    fireEvent.click(screen.getByLabelText(/First/));
    // The link type does not take descriptions
    expect(screen.queryAllByLabelText('createLinks.description')).toHaveLength(
      0,
    );
    fireEvent.click(screen.getByText('createLinks.create'));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(createLink).toHaveBeenCalledTimes(1);
    expect(createLink).toHaveBeenCalledWith(
      'jira:J-1',
      'm/linkTypes/l',
      undefined,
      'inbound',
    );
  });

  it('links from the card given in cardKey', async () => {
    renderMacro({ cardKey: 'm_1' });
    open();
    await screen.findByLabelText(/Second/);
    expect(usedCard).toHaveBeenCalledWith('m_1');
    expect(usedCard).not.toHaveBeenCalledWith('m_0');
    expect(screen.queryByLabelText(/First/)).not.toBeInTheDocument();
  });

  it('skips picks that were linked meanwhile', async () => {
    const { rerender } = renderMacro();
    open();
    fireEvent.click(await screen.findByLabelText(/First/));
    fireEvent.click(screen.getByLabelText(/Second/));
    cardData = {
      ...defaultCard,
      links: [{ key: 'm_1', linkType: 'm/linkTypes/l', direction: 'outbound' }],
    };
    rerender(
      <CreateLinks
        linkType="m/linkTypes/l"
        query="q"
        macroKey="m_0"
        preview={false}
      />,
    );
    fireEvent.click(screen.getByText('createLinks.create'));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(createLink).toHaveBeenCalledTimes(1);
    expect(createLink.mock.calls[0][0]).toBe('m_2');
  });

  describe('descriptions', () => {
    const createFirst = async () => {
      open();
      fireEvent.click(await screen.findByLabelText(/First/));
      return {
        input: screen.getAllByLabelText('createLinks.description')[1],
        submit: () => fireEvent.click(screen.getByText('createLinks.create')),
      };
    };

    beforeEach(() => {
      linkTypesList = withDescriptions;
    });

    it.each([
      ['the prefill', undefined, 'pre', 'pre'],
      ['a per-row override', 'mine', 'pre', 'mine'],
      ['nothing when a prefill is cleared', '', 'pre', undefined],
    ])('sends %s', async (_, typed, prefill, expected) => {
      renderMacro({ linkDescription: prefill });
      const { input, submit } = await createFirst();
      if (typed !== undefined)
        fireEvent.change(input, { target: { value: typed } });
      submit();
      await waitFor(() => expect(createLink).toHaveBeenCalledTimes(1));
      expect(createLink).toHaveBeenCalledWith(
        'm_1',
        'm/linkTypes/l',
        expected,
        'outbound',
      );
    });
  });

  const otherSource = [
    { ...defaultLinkTypes[0], sourceCardTypes: ['m/cardTypes/other'] },
  ];
  // reason: the button's description; undefined when it is not blocked
  it.each([
    {
      when: 'the card has no such link type',
      types: [],
      reason: 'createLinks.unavailable',
    },
    {
      when: 'the direction has no matching expansion',
      types: otherSource,
      reason: 'createLinks.unavailable',
    },
    {
      when: 'the user is a reader',
      editor: false,
      reason: 'permissions.editorRequired',
    },
    { when: 'link types are loading', types: undefined, reason: '' },
    { when: 'the card is loading', card: undefined, reason: '' },
    {
      when: 'the card fails to load',
      card: undefined,
      error: new Error('down'),
      reason: 'createLinks.loadFailed',
    },
    {
      when: 'link types fail to load',
      types: undefined,
      typesError: new Error('down'),
      reason: 'createLinks.loadFailed',
    },
    { when: 'the link type matches', reason: undefined },
  ])('gates the button when $when', async ({ reason, ...row }) => {
    if ('types' in row) linkTypesList = row.types;
    if ('card' in row) cardData = row.card;
    if ('error' in row) cardError = row.error;
    if ('typesError' in row) linkTypesError = row.typesError;
    canEdit = row.editor ?? true;
    renderMacro();
    const blocked = reason !== undefined;
    fireEvent.focus(button());
    if (reason) {
      await waitFor(() => expect(button()).toHaveAccessibleDescription(reason));
    } else {
      // Longer than the tooltip's enter delay
      await act(() => new Promise((resolve) => setTimeout(resolve, 300)));
      expect(button()).not.toHaveAccessibleDescription();
    }
    expect(button().getAttribute('aria-disabled')).toBe(
      blocked ? 'true' : null,
    );
    open();
    expect(!!screen.queryByRole('dialog')).toBe(!blocked);
  });

  it('only notifies in preview mode', () => {
    renderMacro({ preview: true });
    open();
    expect(screen.queryByText('createLinks.title')).not.toBeInTheDocument();
    expect(dispatch.mock.calls[0][0].payload.message).toBe(
      'createLinks.preview',
    );
  });

  it('shows a query error in the dialog', () => {
    queryError = new Error('bad query');
    renderMacro();
    open();
    expect(screen.getByRole('alert')).toHaveTextContent('bad query');
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });

  it('lists no rows while a reopen refetches', () => {
    validating = true;
    renderMacro();
    open();
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('announces when there is nothing to link', () => {
    candidates = [];
    renderMacro();
    open();
    expect(screen.getByRole('status')).toHaveTextContent(
      'createLinks.noResults',
    );
  });

  it('cannot be closed while creating', async () => {
    let finish: () => void = () => {};
    createLink.mockImplementation(
      () => new Promise<void>((resolve) => (finish = resolve)),
    );
    renderMacro();
    open();
    fireEvent.click(await screen.findByLabelText(/First/));
    fireEvent.click(screen.getByText('createLinks.create'));
    const cancel = screen.getByRole('button', { name: 'cancel' });
    const closeButtons = screen
      .getAllByRole('button')
      .filter((b) => b.className.includes('ModalClose'));
    expect(closeButtons).toHaveLength(1);
    expect(cancel).toBeDisabled();
    expect(closeButtons[0]).toBeDisabled();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    finish();
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
  });

  it('creates links one at a time', async () => {
    const pending: (() => void)[] = [];
    createLink.mockImplementation(
      () => new Promise<void>((resolve) => pending.push(resolve)),
    );
    renderMacro();
    open();
    fireEvent.click(await screen.findByLabelText(/First/));
    fireEvent.click(screen.getByLabelText(/Second/));
    fireEvent.click(screen.getByText('createLinks.create'));
    await waitFor(() => expect(createLink).toHaveBeenCalledTimes(1));
    await act(() => Promise.resolve());
    expect(createLink).toHaveBeenCalledTimes(1);
    pending[0]();
    await waitFor(() => expect(createLink).toHaveBeenCalledTimes(2));
    pending[1]();
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
  });

  describe('pagination', () => {
    const manyCards = (count: number): LinkCandidate[] =>
      Array.from({ length: count }, (_, i) => ({
        key: `m_${i + 10}`,
        kind: 'card',
        title: `Card ${i + 10}`,
        cardType: 'm/cardTypes/t',
      }));
    const rows = () => screen.getAllByRole('checkbox');
    const shows = (title: string) =>
      !!screen.queryByLabelText(new RegExp(title));
    const next = () =>
      fireEvent.click(
        screen.getByRole('button', { name: 'createLinks.nextPage' }),
      );
    const previous = () =>
      fireEvent.click(
        screen.getByRole('button', { name: 'createLinks.previousPage' }),
      );

    beforeEach(() => {
      candidates = manyCards(12);
    });

    it('pages through the candidates ten at a time', () => {
      renderMacro();
      open();
      expect(rows()).toHaveLength(10);
      expect(shows('Card 10')).toBe(true);
      next();
      expect(rows()).toHaveLength(2);
      expect(shows('Card 21')).toBe(true);
      previous();
      expect(shows('Card 10')).toBe(true);
    });

    it('returns to the first page on search', () => {
      renderMacro();
      open();
      next();
      fireEvent.change(screen.getByLabelText('createLinks.search'), {
        target: { value: 'Card' },
      });
      expect(shows('Card 10')).toBe(true);
    });

    it('stays on a page that has rows when the list shrinks', () => {
      const { rerender } = renderMacro();
      open();
      next();
      candidates = manyCards(5);
      rerender(
        <CreateLinks
          linkType="m/linkTypes/l"
          query="q"
          macroKey="m_0"
          preview={false}
        />,
      );
      expect(rows()).toHaveLength(5);
    });
  });
});
