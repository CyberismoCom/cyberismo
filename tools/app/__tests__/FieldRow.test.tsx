import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
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
});
