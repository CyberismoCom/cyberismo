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

    it('shows the same empty rendering as a regular field when there is no calculated value', () => {
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
    });
  });

  describe('overrideMode (edit mode)', () => {
    it('does not prefill the editor from the calculated value, and Clear saves null', () => {
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

      expect(screen.getByText('person1@example.com')).toBeInTheDocument();
      const input = screen.getByRole('textbox') as HTMLInputElement;
      expect(input.value).toBe('');

      fireEvent.click(screen.getByText('Clear'));
      expect(onSave).toHaveBeenCalledWith(null);
    });
  });
});
