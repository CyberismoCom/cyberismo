/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026

  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/
import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom';
import { BrowserRouter } from 'react-router';
import type * as libHooksModule from '@/lib/hooks';

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

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn().mockResolvedValue({ svg: '<svg id="mock-mermaid"></svg>' }),
  },
}));

import { renderCardHtml } from '@/components/card/renderCardContent';

const graphWrapper = (id: string) =>
  `<div class="cyberismo-svg-wrapper" data-type="cyberismo-svg-wrapper"><svg id="${id}" viewBox="0 0 10 10"></svg></div>`;

// Card with two graph macros, mimicking asciidoctor output
const CARD_A = `
<div class="sect1">
<h2 id="_context_diagram">Context diagram</h2>
<div class="sectionbody">
${graphWrapper('graph-a1')}
${graphWrapper('graph-a2')}
</div>
</div>`;

// A differently shaped card with one graph macro
const CARD_B = `
<div class="paragraph"><p>Another card</p></div>
${graphWrapper('graph-b1')}`;

function Content({ html }: { html: string }) {
  return (
    <BrowserRouter>
      <div className="doc">
        {renderCardHtml(html, {
          macroKey: 'test_card',
          preview: false,
          downloadName: 'Test card',
        })}
      </div>
    </BrowserRouter>
  );
}

describe('renderCardHtml', () => {
  it('renders one set of svg controls per graph wrapper', () => {
    const { container } = render(<Content html={CARD_A} />);

    expect(container.querySelectorAll('svg[id^="graph-"]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-cy="svg-controls"]')).toHaveLength(
      2,
    );
  });

  // Regression: navigating A -> B -> A leaked orphaned control bars because
  // controls were appended imperatively to React-managed DOM nodes.
  it('does not leak controls when content is swapped back and forth', () => {
    const { container, rerender } = render(<Content html={CARD_A} />);
    expect(container.querySelectorAll('[data-cy="svg-controls"]')).toHaveLength(
      2,
    );

    rerender(<Content html={CARD_B} />);
    expect(container.querySelectorAll('[data-cy="svg-controls"]')).toHaveLength(
      1,
    );

    rerender(<Content html={CARD_A} />);
    expect(container.querySelectorAll('[data-cy="svg-controls"]')).toHaveLength(
      2,
    );
    expect(
      container.querySelectorAll('[aria-label="fullscreen"]'),
    ).toHaveLength(2);
  });

  it('renders mermaid blocks with controls', async () => {
    const code = btoa('graph TD; A-->B');
    const html = `<div class="mermaid-block" data-mermaid-code="${code}"></div>`;

    const { container } = render(<Content html={html} />);

    await waitFor(() => {
      expect(container.querySelector('svg#mock-mermaid')).not.toBeNull();
    });
    expect(container.querySelectorAll('[data-cy="svg-controls"]')).toHaveLength(
      1,
    );
  });
});
