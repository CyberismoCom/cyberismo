import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BrowserRouter } from 'react-router';
import type { ReactNode } from 'react';
import type * as libHooksModule from '@/lib/hooks';

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

vi.mock('@/lib/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof libHooksModule>();
  return {
    ...actual,
    useAppRouter: vi.fn(() => ({
      push: vi.fn(),
      replace: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      safePush: vi.fn(),
      safeReplace: vi.fn(),
      safeBack: vi.fn(),
      safeForward: vi.fn(),
    })),
  };
});

vi.mock('@/lib/hooks/theme', () => ({
  useIsDarkMode: vi.fn(() => false),
}));

import Mermaid from '@/components/macros/Mermaid';

const wrap = (ui: ReactNode) => <BrowserRouter>{ui}</BrowserRouter>;

describe('Mermaid component', () => {
  it('renders a mermaid diagram from code', async () => {
    const { container } = render(
      wrap(
        <Mermaid
          code="graph TD\n    A-->B"
          macroKey="test-1"
          preview={false}
        />,
      ),
    );

    await waitFor(() => {
      expect(container.querySelector('svg')).not.toBeNull();
    });
  });

  it('wraps SVG in a cyberismo-svg-wrapper with controls', async () => {
    const { container } = render(
      wrap(
        <Mermaid
          code="graph TD\n    A-->B"
          macroKey="test-4"
          preview={false}
        />,
      ),
    );

    await waitFor(() => {
      expect(
        container.querySelector('[data-type="cyberismo-svg-wrapper"]'),
      ).not.toBeNull();
    });
    const controls = container.querySelector('[data-cy="svg-controls"]');
    expect(controls).not.toBeNull();
    expect(controls!.querySelector('[aria-label="fullscreen"]')).not.toBeNull();
    expect(controls!.querySelector('[aria-label="download"]')).not.toBeNull();
  });

  it('shows an error when no code is provided', () => {
    render(wrap(<Mermaid code="" macroKey="test-2" preview={false} />));

    expect(screen.getByText(/No Mermaid diagram code provided/)).toBeDefined();
  });

  it('shows an error message when mermaid rendering fails', async () => {
    render(wrap(<Mermaid code="invalid" macroKey="test-3" preview={false} />));

    await waitFor(() => {
      expect(screen.getByText(/Parse error/)).toBeDefined();
    });
  });
});
