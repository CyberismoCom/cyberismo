// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import '@/lib/i18n';
import FieldEditor from '@/components/FieldEditor';

const enumValues = [
  { enumValue: 'none', enumDisplayValue: 'None' },
  { enumValue: 'high', enumDisplayValue: 'High' },
];

const clearButton = () => screen.queryByRole('button', { name: /^Clear/ });

describe('FieldEditor', () => {
  describe.each([
    { dataType: 'enum' as const, value: 'high', empty: null, cleared: null },
    // false, not true: "No" is a value, and must keep the Clear button.
    { dataType: 'boolean' as const, value: false, empty: null, cleared: null },
    { dataType: 'list' as const, value: ['high'], empty: [], cleared: [] },
    {
      dataType: 'date' as const,
      value: '2026-11-24',
      empty: null,
      cleared: null,
    },
    {
      dataType: 'dateTime' as const,
      value: '2026-11-24T10:00',
      empty: null,
      cleared: null,
    },
  ])('$dataType editor', ({ dataType, value, empty, cleared }) => {
    it('has no Clear button when the field is empty', () => {
      render(
        <FieldEditor
          value={empty}
          dataType={dataType}
          enumValues={enumValues}
        />,
      );

      expect(clearButton()).not.toBeInTheDocument();
    });

    it('clears the field and commits', () => {
      const onChange = vi.fn();
      const onCommit = vi.fn();
      render(
        <FieldEditor
          value={value}
          dataType={dataType}
          enumValues={enumValues}
          onChange={onChange}
          onCommit={onCommit}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

      expect(onChange).toHaveBeenCalledWith(cleared);
      expect(onCommit).toHaveBeenCalledOnce();
    });

    it('has no Clear button when the editor is disabled', () => {
      render(
        <FieldEditor
          value={value}
          dataType={dataType}
          enumValues={enumValues}
          disabled
        />,
      );

      expect(clearButton()).not.toBeInTheDocument();
    });

    it('has no Clear button when clearable is false', () => {
      render(
        <FieldEditor
          value={value}
          dataType={dataType}
          enumValues={enumValues}
          clearable={false}
        />,
      );

      expect(clearButton()).not.toBeInTheDocument();
    });
  });

  it('names the field in the Clear button when the label is hidden', () => {
    render(
      <FieldEditor
        value="high"
        dataType="enum"
        enumValues={enumValues}
        ariaLabel="Priority"
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Clear Priority' }),
    ).toHaveTextContent('Clear');
  });

  describe.each([
    { dataType: 'enum' as const, shown: 'High' },
    { dataType: 'boolean' as const, shown: 'Yes' },
  ])('empty $dataType editor', ({ dataType, shown }) => {
    it('shows the placeholder', () => {
      render(
        <FieldEditor
          value={null}
          dataType={dataType}
          enumValues={enumValues}
          ariaLabel="Field"
        />,
      );

      const button = screen.getByRole('combobox', { name: 'Field' });
      expect(button).toHaveTextContent('Select');
      expect(button).not.toHaveTextContent(shown);
    });

    it('has no "None" option', () => {
      render(
        <FieldEditor
          value={null}
          dataType={dataType}
          enumValues={dataType === 'enum' ? enumValues.slice(1) : undefined}
          ariaLabel="Field"
        />,
      );

      fireEvent.click(screen.getByRole('combobox', { name: 'Field' }));
      expect(screen.getByRole('listbox')).toBeInTheDocument();
      expect(
        screen.queryByRole('option', { name: 'None' }),
      ).not.toBeInTheDocument();
    });
  });
});
