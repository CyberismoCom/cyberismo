import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { FieldRow } from '@/components/card/metadata-section/FieldRow';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        yes: 'Yes',
        no: 'No',
      };
      return translations[key] || key;
    },
  }),
}));

describe('FieldRow', () => {
  it('renders an empty value for a null boolean field (INTDEV-1307)', () => {
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
