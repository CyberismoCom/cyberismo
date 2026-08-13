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
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom';
import { BrowserRouter } from 'react-router';

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

  // In-app anchors become react-router <Link>s, so what is asserted here is the
  // path the router ends up on. Anything left to the browser keeps its original
  // href and does not move the location.
  describe('links', () => {
    const link = (href: string) =>
      `<div class="paragraph"><p><a href="${href}">target card</a></p></div>`;

    beforeEach(() => {
      window.history.replaceState({}, '', '/');
    });

    it('routes a root-relative link through the router', () => {
      render(<Content html={link('/cards/csecdev_6wccziw3')} />);

      fireEvent.click(screen.getByText('target card'));

      expect(window.location.pathname).toBe('/cards/csecdev_6wccziw3');
    });

    // A full app URL must reach the Link already stripped to an origin-relative
    // path. Router-side navigation copes with either form, but the origin is
    // what the rendered href — and so hover, copy-link and middle-click — shows.
    it('routes an absolute same-origin link as an origin-relative path', () => {
      const href = `${window.location.origin}/projects/csecdev/cards/csecdev_6wccziw3`;
      render(<Content html={link(href)} />);

      const anchor = screen.getByText('target card');
      expect(anchor).toHaveAttribute(
        'href',
        '/projects/csecdev/cards/csecdev_6wccziw3',
      );

      fireEvent.click(anchor);

      expect(window.location.pathname).toBe(
        '/projects/csecdev/cards/csecdev_6wccziw3',
      );
    });

    it('leaves external links to the browser', () => {
      render(<Content html={link('https://example.com/cards/x')} />);

      const anchor = screen.getByText('target card');

      expect(anchor).toHaveAttribute('href', 'https://example.com/cards/x');
      expect(window.location.pathname).toBe('/');
    });

    it('leaves anchor fragments to the browser', () => {
      render(<Content html={link('#_section_title')} />);

      const anchor = screen.getByText('target card');

      expect(anchor).toHaveAttribute('href', '#_section_title');
      expect(window.location.pathname).toBe('/');
    });
  });
});
