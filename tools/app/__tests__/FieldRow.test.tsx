import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { FieldRow } from '@/components/card/metadata-section/FieldRow';

describe('FieldRow', () => {
  it('renders an empty value for a null boolean field', () => {
    render(<FieldRow value={null} label="Boolean field" dataType="boolean" />);

    expect(screen.getByText('Boolean field')).toBeInTheDocument();
    expect(screen.queryByText('No')).not.toBeInTheDocument();
    expect(screen.queryByText('Yes')).not.toBeInTheDocument();
  });

  it('renders "No" for a false boolean field', () => {
    render(<FieldRow value={false} label="Boolean field" dataType="boolean" />);

    expect(screen.getByText('No')).toBeInTheDocument();
  });

  it('renders "Yes" for a true boolean field', () => {
    render(<FieldRow value={true} label="Boolean field" dataType="boolean" />);

    expect(screen.getByText('Yes')).toBeInTheDocument();
  });

  describe('overrideMode (read mode)', () => {
    it('shows the override value alone when an override exists', () => {
      render(
        <FieldRow
          value="person2@example.com"
          overrideValue="person2@example.com"
          calculatedValue="person1@example.com"
          overrideMode
          label="Owner"
          dataType="person"
        />,
      );

      expect(screen.getByText('Owner')).toBeInTheDocument();
      expect(screen.getByText('person2@example.com')).toBeInTheDocument();
    });

    it('shows the calculated value alone when no override exists', () => {
      render(
        <FieldRow
          value="person1@example.com"
          overrideValue={null}
          calculatedValue="person1@example.com"
          overrideMode
          label="Owner"
          dataType="person"
        />,
      );

      expect(screen.getByText('person1@example.com')).toBeInTheDocument();
      expect(screen.queryByText(/Calculated value/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Override/)).not.toBeInTheDocument();
    });
  });

  describe('overrideMode (edit mode)', () => {
    it('does not prefill the editor from the calculated value', () => {
      render(
        <FieldRow
          value="person1@example.com"
          overrideValue={null}
          calculatedValue="person1@example.com"
          overrideMode
          label="Owner"
          dataType="person"
          isEditing
          expanded
          onSave={vi.fn()}
        />,
      );

      expect(screen.getByText('person1@example.com')).toBeInTheDocument();
      const input = screen.getByRole('textbox') as HTMLInputElement;
      expect(input.value).toBe('');
    });

    it('disables Clear when there is no existing override and nothing has been typed', () => {
      render(
        <FieldRow
          value="person1@example.com"
          overrideValue={null}
          calculatedValue="person1@example.com"
          overrideMode
          label="Owner"
          dataType="person"
          isEditing
          expanded
          onSave={vi.fn()}
        />,
      );

      expect(screen.getByText('Clear').closest('button')).toBeDisabled();
    });

    it('clicking Clear saves null when there is an existing override', () => {
      const onSave = vi.fn();
      render(
        <FieldRow
          value="person2@example.com"
          overrideValue="person2@example.com"
          calculatedValue="person1@example.com"
          overrideMode
          label="Owner"
          dataType="person"
          isEditing
          expanded
          onSave={onSave}
        />,
      );

      const clearButton = screen.getByText('Clear').closest('button');
      expect(clearButton).not.toBeDisabled();

      fireEvent.click(clearButton!);
      expect(onSave).toHaveBeenCalledWith(null);
    });

    it('pressing Enter while the Clear button is focused clears the override instead of saving it', () => {
      const onSave = vi.fn();
      render(
        <FieldRow
          value="person1@example.com"
          overrideValue={null}
          calculatedValue="person1@example.com"
          overrideMode
          label="Owner"
          dataType="person"
          isEditing
          expanded
          onSave={onSave}
        />,
      );

      // Type something so the row is dirty and Clear becomes enabled.
      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: 'person2@example.com' } });

      const clearButton = screen.getByText('Clear').closest('button')!;
      clearButton.focus();

      // A real browser's default action for Enter on a focused button is to
      // click it. jsdom doesn't simulate that default action, so once we've
      // confirmed the row's onKeyDown didn't swallow the keydown (a `false`
      // return means preventDefault() was called), we fire the click that
      // the browser would have produced.
      const notSwallowed = fireEvent.keyDown(clearButton, { key: 'Enter' });
      if (notSwallowed) {
        fireEvent.click(clearButton);
      }

      // Before the fix, the row's onKeyDown treats plain Enter as "save the
      // dirty form value", so onSave gets called with the typed override
      // instead of null — this assertion catches that regression.
      expect(onSave).toHaveBeenCalledTimes(1);
      expect(onSave).toHaveBeenCalledWith(null);
    });

    it('pressing Enter in the editor still saves the typed override', () => {
      const onSave = vi.fn();
      render(
        <FieldRow
          value="person1@example.com"
          overrideValue={null}
          calculatedValue="person1@example.com"
          overrideMode
          label="Owner"
          dataType="person"
          isEditing
          expanded
          onSave={onSave}
        />,
      );

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: 'person2@example.com' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(onSave).toHaveBeenCalledWith('person2@example.com');
    });
  });

  describe('save-on-blur (INTDEV-1377)', () => {
    it('calls onSave on blur when the field is dirty', () => {
      const onSave = vi.fn();
      render(
        <FieldRow
          value="original"
          label="Short text"
          dataType="shortText"
          isEditing
          expanded
          onSave={onSave}
          onCancel={vi.fn()}
        />,
      );

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: 'changed' } });
      fireEvent.blur(input);

      expect(onSave).toHaveBeenCalledWith('changed');
    });

    it('still saves when focus moves to a button outside this row', () => {
      const onSave = vi.fn();
      render(
        <>
          <button type="button">Unrelated toolbar button</button>
          <FieldRow
            value="original"
            label="Short text"
            dataType="shortText"
            isEditing
            expanded
            onSave={onSave}
            onCancel={vi.fn()}
          />
        </>,
      );

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: 'changed' } });
      fireEvent.blur(input, {
        relatedTarget: screen.getByRole('button', {
          name: 'Unrelated toolbar button',
        }),
      });

      expect(onSave).toHaveBeenCalledWith('changed');
    });

    it('does not save when focus moves to this row’s own Cancel button', () => {
      const onSave = vi.fn();
      const { container } = render(
        <FieldRow
          value="original"
          label="Short text"
          dataType="shortText"
          isEditing
          expanded
          onSave={onSave}
          onCancel={vi.fn()}
        />,
      );

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: 'changed' } });
      fireEvent.blur(input, {
        relatedTarget: container.querySelector(
          '[data-cy="fieldCancelButton"]',
        ) as HTMLElement,
      });

      expect(onSave).not.toHaveBeenCalled();
    });

    it('does not save while focus is inside a Select’s listbox popup', () => {
      const onSave = vi.fn();
      render(
        <FieldRow
          value="original"
          label="Short text"
          dataType="shortText"
          isEditing
          expanded
          onSave={onSave}
          onCancel={vi.fn()}
        />,
      );

      // A Joy Select renders its listbox in a portal outside the row, and
      // focuses an option while open — the field is still being edited.
      const listbox = document.createElement('ul');
      listbox.setAttribute('role', 'listbox');
      const option = document.createElement('li');
      listbox.appendChild(option);
      document.body.appendChild(listbox);

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: 'changed' } });
      fireEvent.blur(input, { relatedTarget: option });

      expect(onSave).not.toHaveBeenCalled();
      document.body.removeChild(listbox);
    });

    it('does not call onSave on blur when the field is unchanged', () => {
      const onSave = vi.fn();
      render(
        <FieldRow
          value="original"
          label="Short text"
          dataType="shortText"
          isEditing
          expanded
          onSave={onSave}
          onCancel={vi.fn()}
        />,
      );

      fireEvent.blur(screen.getByRole('textbox'));
      expect(onSave).not.toHaveBeenCalled();
    });

    it('Save and Cancel prevent the default mousedown action, so clicking them cannot be pre-empted by a blur-save', () => {
      const onSave = vi.fn();
      const { container } = render(
        <FieldRow
          value="original"
          label="Short text"
          dataType="shortText"
          isEditing
          expanded
          onSave={onSave}
          onCancel={vi.fn()}
        />,
      );

      fireEvent.change(screen.getByRole('textbox'), {
        target: { value: 'changed' },
      });

      const saveButton = container.querySelector(
        '[data-cy="fieldSaveButton"]',
      )!;
      const cancelButton = container.querySelector(
        '[data-cy="fieldCancelButton"]',
      )!;
      expect(fireEvent.mouseDown(saveButton)).toBe(false);
      expect(fireEvent.mouseDown(cancelButton)).toBe(false);
    });

    it('seeds the editor fresh each time a field is (re)opened for editing', () => {
      const { rerender } = render(
        <FieldRow
          value="v1"
          label="Short text"
          dataType="shortText"
          isEditing={false}
          expanded={false}
          onSave={vi.fn()}
          onCancel={vi.fn()}
        />,
      );
      rerender(
        <FieldRow
          value="v1"
          label="Short text"
          dataType="shortText"
          isEditing
          expanded
          onSave={vi.fn()}
          onCancel={vi.fn()}
        />,
      );
      expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe(
        'v1',
      );

      // Closed (e.g. editingFieldKey moved to a different field), then the
      // saved value moves on before this field is reopened — reopening must
      // show the latest value.
      rerender(
        <FieldRow
          value="v2"
          label="Short text"
          dataType="shortText"
          isEditing={false}
          expanded={false}
          onSave={vi.fn()}
          onCancel={vi.fn()}
        />,
      );
      rerender(
        <FieldRow
          value="v2"
          label="Short text"
          dataType="shortText"
          isEditing
          expanded
          onSave={vi.fn()}
          onCancel={vi.fn()}
        />,
      );
      expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe(
        'v2',
      );
    });
  });
});
