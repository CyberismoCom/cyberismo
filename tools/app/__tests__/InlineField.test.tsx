// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom';
import InlineField from '@/components/macros/InlineField';
import type { InlineFieldProps } from '@/components/macros/InlineField';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { label?: string; value?: string }) =>
      (options?.label ?? options?.value)
        ? `${key} ${options.label ?? options.value}`
        : key,
  }),
}));

const row = (overrides: Partial<InlineFieldProps['row']> = {}) => ({
  label: 'Owner',
  dataType: 'shortText' as const,
  value: 'Ann',
  ...overrides,
});

const field = (props: Partial<InlineFieldProps> = {}) => ({
  row: row(),
  showLabel: false,
  editability: { disabled: false },
  onSave: vi.fn().mockResolvedValue(true),
  ...props,
});

describe('InlineField states', () => {
  it.each([
    {
      name: 'editable with its label',
      props: field({ showLabel: true }),
      button: 'Owner: Ann',
      text: 'Owner:',
    },
    {
      name: 'empty for an editor',
      props: field({ row: row({ value: null }) }),
      button: 'fieldMacro.enter Owner',
      text: 'fieldMacro.enter Owner',
    },
  ])('$name is a button showing "$text"', ({ props, button, text }) => {
    render(<InlineField {...props} />);

    const value = screen.getByRole('button', { name: button });
    expect(value).toHaveAttribute('aria-haspopup', 'dialog');
    expect(value).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText(text, { exact: false })).toBeInTheDocument();
  });

  it('shows a dash to a reader of an empty field', () => {
    render(
      <InlineField
        {...field({
          editability: { disabled: true, cause: 'readOnly' },
          row: row({ value: null }),
        })}
      />,
    );

    expect(screen.getByText('fieldMacro.empty')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByTestId('LockOutlinedIcon')).not.toBeInTheDocument();
  });

  it('marks a calculated value and explains it', async () => {
    render(
      <InlineField
        {...field({ editability: { disabled: true, cause: 'calculated' } })}
      />,
    );

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    const marker = screen.getByRole('img', { name: 'fieldMacro.calculated' });
    expect(marker).toHaveTextContent('fieldMacro.calculatedMark');
    fireEvent.mouseOver(marker);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'calculatedField',
    );
  });

  it('marks an override with the calculated value', () => {
    render(
      <InlineField
        {...field({
          row: row({
            overrideMode: true,
            overrideValue: 'Ann',
            calculatedValue: 'Bob',
          }),
        })}
      />,
    );

    const marker = screen.getByRole('img', {
      name: 'overriddenWithCalculatedValue Bob',
    });
    expect(marker).toHaveTextContent('*');
  });

  it.each([
    { cause: 'role', reason: 'Editors only', lock: false },
    { cause: 'denied', reason: 'Not allowed', lock: true },
  ] as const)(
    'tells a field disabled by $cause why, with a lock only if denied',
    async ({ cause, reason, lock }) => {
      render(
        <InlineField
          {...field({ editability: { disabled: true, cause, reason } })}
        />,
      );

      expect(screen.queryByRole('button')).not.toBeInTheDocument();
      expect(!!screen.queryByTestId('LockOutlinedIcon')).toBe(lock);
      fireEvent.mouseOver(screen.getByText('Ann'));
      expect(await screen.findByRole('tooltip')).toHaveTextContent(reason);
    },
  );
});

describe('InlineField popover', () => {
  const open = (props: Partial<InlineFieldProps> = {}) => {
    const onSave = props.onSave ?? vi.fn().mockResolvedValue(true);
    render(<InlineField {...field({ ...props, onSave })} />);
    const button = screen.getByRole('button', { name: /Owner/ });
    fireEvent.click(button);
    return { onSave, button };
  };
  const editor = () =>
    within(screen.getByRole('dialog', { name: 'Owner' })).getByLabelText(
      'Owner',
    );
  const type = (value: string) =>
    fireEvent.change(editor(), { target: { value } });

  it('saves the coerced value and returns focus', async () => {
    const { onSave, button } = open({
      row: row({ dataType: 'integer', value: 1 }),
    });
    expect(button).toHaveAttribute('aria-expanded', 'true');

    type('42');
    fireEvent.click(screen.getByRole('button', { name: 'save' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(42));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(button).toHaveFocus();
  });

  it('saves on Enter', async () => {
    const { onSave } = open();

    type('Bob');
    fireEvent.keyDown(editor(), { key: 'Enter' });

    await waitFor(() => expect(onSave).toHaveBeenCalledWith('Bob'));
  });

  it('stays open when the save fails', async () => {
    const { onSave } = open({ onSave: vi.fn().mockResolvedValue(false) });

    type('Bob');
    fireEvent.click(screen.getByRole('button', { name: 'save' }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(editor()).toBeInTheDocument();
  });

  it.each([
    {
      name: 'Cancel',
      act: () =>
        fireEvent.click(screen.getByRole('button', { name: 'cancel' })),
    },
    {
      name: 'Escape',
      act: () => fireEvent.keyDown(editor(), { key: 'Escape' }),
    },
  ])('$name closes without saving and returns focus', async ({ act }) => {
    const { onSave, button } = open();

    type('Bob');
    // The click-away listener arms after the opening click has settled.
    await new Promise((r) => setTimeout(r, 0));
    act();

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(onSave).not.toHaveBeenCalled();
    expect(button).toHaveFocus();
  });

  it.each([
    { name: 'a click outside', leave: () => fireEvent.click(document.body) },
    { name: 'tabbing out', leave: () => screen.getByTestId('other').focus() },
  ])('$name closes without saving or taking focus', async ({ leave }) => {
    const onSave = vi.fn();
    render(
      <>
        <InlineField {...field({ onSave })} />
        <input data-testid="other" aria-label="other" />
      </>,
    );
    const button = screen.getByRole('button', { name: /Owner/ });
    fireEvent.click(button);
    type('Bob');
    // The click-away listener arms after the opening click has settled.
    await new Promise((r) => setTimeout(r, 0));
    leave();

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(onSave).not.toHaveBeenCalled();
    expect(button).not.toHaveFocus();
  });

  it('stays closed when the field becomes editable again', () => {
    const { rerender } = render(<InlineField {...field()} />);
    fireEvent.click(screen.getByRole('button', { name: /Owner/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    rerender(
      <InlineField
        {...field({ editability: { disabled: true, cause: 'readOnly' } })}
      />,
    );
    rerender(<InlineField {...field()} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('clears an override', async () => {
    const { onSave } = open({
      row: row({
        value: 'Zed',
        overrideMode: true,
        overrideValue: 'Ann',
        calculatedValue: 'Bob',
      }),
    });

    // The editor starts from the stored override, not the value shown or the calculated one.
    expect(editor()).toHaveValue('Ann');
    expect(screen.getByText('Bob')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'clearOverride' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(null));
  });
});
