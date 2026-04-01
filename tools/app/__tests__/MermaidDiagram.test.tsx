import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('mermaid', () => {
  let counter = 0;
  return {
    default: {
      initialize: vi.fn(),
      render: vi.fn().mockImplementation((_id: string, code: string) => {
        counter++;
        if (code === 'invalid') {
          return Promise.reject(new Error('Parse error'));
        }
        return Promise.resolve({
          svg: `<svg id="mock-${counter}"><text>${code}</text></svg>`,
        });
      }),
    },
  };
});

import Mermaid from '@/components/macros/Mermaid';

describe('Mermaid component', () => {
  it('renders a mermaid diagram from code', async () => {
    const { container } = render(
      <Mermaid code="graph TD\n    A-->B" macroKey="test-1" preview={false} />,
    );

    await waitFor(() => {
      expect(container.querySelector('svg')).not.toBeNull();
    });
  });

  it('shows an error when no code is provided', () => {
    render(<Mermaid code="" macroKey="test-2" preview={false} />);

    expect(
      screen.getByText(/No Mermaid diagram code provided/),
    ).toBeDefined();
  });

  it('shows an error message when mermaid rendering fails', async () => {
    render(<Mermaid code="invalid" macroKey="test-3" preview={false} />);

    await waitFor(() => {
      expect(screen.getByText(/Parse error/)).toBeDefined();
    });
  });
});
