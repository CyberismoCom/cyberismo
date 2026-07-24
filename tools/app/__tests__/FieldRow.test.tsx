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
    it('shows both the automatic value and the override value', () => {
      render(
        <FieldRow
          value="person2@example.com"
          calculatedValue="person1@example.com"
          overrideMode
          label="Owner"
          dataType="person"
        />,
      );

      expect(screen.getByText('Owner')).toBeInTheDocument();
      expect(screen.getByText(/Automatic value/)).toBeInTheDocument();
      expect(screen.getByText('person1@example.com')).toBeInTheDocument();
      expect(screen.getByText(/Override/)).toBeInTheDocument();
      expect(screen.getByText('person2@example.com')).toBeInTheDocument();
    });

    it('renders the automatic value and the override value the same way a regular field renders an empty value', () => {
      const { container } = render(
        <FieldRow
          value={null}
          calculatedValue={null}
          overrideMode
          label="Owner"
          dataType="person"
        />,
      );

      const automaticValue = container.querySelector(
        '[data-cy="automaticValue"]',
      );
      expect(automaticValue?.textContent?.trim()).toBe('Automatic value:');

      const overrideValue = container.querySelector(
        '[data-cy="overrideValue"]',
      );
      expect(overrideValue?.textContent?.trim()).toBe('Override:');
    });
  });

  describe('overrideMode (edit mode)', () => {
    it('does not prefill the editor from the calculated value', () => {
      render(
        <FieldRow
          value={null}
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
          value={null}
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
          value={null}
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
          value={null}
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
});
