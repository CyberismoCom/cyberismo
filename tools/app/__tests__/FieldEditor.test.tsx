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

describe('FieldEditor', () => {
  describe.each([
    {
      dataType: 'enum' as const,
      value: 'high',
      shown: 'High',
    },
    {
      dataType: 'boolean' as const,
      value: true,
      shown: 'Yes',
    },
  ])('$dataType editor', ({ dataType, value, shown }) => {
    it('shows the placeholder and no clear button when the field is empty', () => {
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
      expect(
        screen.queryByRole('button', { name: 'Clear field' }),
      ).not.toBeInTheDocument();
    });

    it('clears the field with the clear button', () => {
      const onChange = vi.fn();
      const onCommit = vi.fn();
      render(
        <FieldEditor
          value={value}
          dataType={dataType}
          enumValues={enumValues}
          onChange={onChange}
          onCommit={onCommit}
          ariaLabel="Field"
        />,
      );

      expect(screen.getByRole('combobox', { name: 'Field' })).toHaveTextContent(
        shown,
      );
      const clear = screen.getByRole('button', { name: 'Clear field' });
      expect(clear).toHaveTextContent('Clear');
      fireEvent.mouseDown(clear);
      fireEvent.click(clear);

      expect(onChange).toHaveBeenCalledWith(null);
      expect(onCommit).toHaveBeenCalled();
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('hides the clear button when the editor is disabled', () => {
      render(
        <FieldEditor
          value={value}
          dataType={dataType}
          enumValues={enumValues}
          disabled
          ariaLabel="Field"
        />,
      );

      expect(
        screen.queryByRole('button', { name: 'Clear field' }),
      ).not.toBeInTheDocument();
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

  describe.each([
    { dataType: 'date' as const, value: '2026-11-24', cleared: null },
    {
      dataType: 'dateTime' as const,
      value: '2026-11-24T10:00',
      cleared: null,
    },
    { dataType: 'list' as const, value: ['high'], cleared: [] },
  ])('$dataType editor', ({ dataType, value, cleared }) => {
    it('has no clear button when the field is empty', () => {
      render(
        <FieldEditor
          value={dataType === 'list' ? [] : null}
          dataType={dataType}
          enumValues={enumValues}
          ariaLabel="Field"
        />,
      );

      expect(
        screen.queryByRole('button', { name: 'Clear field' }),
      ).not.toBeInTheDocument();
    });

    it('clears the field with the clear button', () => {
      const onChange = vi.fn();
      const onCommit = vi.fn();
      render(
        <FieldEditor
          value={value}
          dataType={dataType}
          enumValues={enumValues}
          onChange={onChange}
          onCommit={onCommit}
          ariaLabel="Field"
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Clear field' }));

      expect(onChange).toHaveBeenCalledWith(cleared);
      expect(onCommit).toHaveBeenCalled();
    });

    it('hides the clear button when the editor is disabled', () => {
      render(
        <FieldEditor
          value={value}
          dataType={dataType}
          enumValues={enumValues}
          disabled
          ariaLabel="Field"
        />,
      );

      expect(
        screen.queryByRole('button', { name: 'Clear field' }),
      ).not.toBeInTheDocument();
    });
  });
});
