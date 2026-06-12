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
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom';
import { BrowserRouter } from 'react-router';
import type { ReactNode } from 'react';
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

import SvgWrapper from '@/components/SvgWrapper';

const wrap = (ui: ReactNode) => <BrowserRouter>{ui}</BrowserRouter>;

describe('SvgWrapper', () => {
  it('renders svg content inside a cyberismo-svg-wrapper with controls', () => {
    const { container } = render(
      wrap(
        <SvgWrapper>
          <svg id="diagram" viewBox="0 0 10 10" />
        </SvgWrapper>,
      ),
    );

    const wrapper = container.querySelector(
      '[data-type="cyberismo-svg-wrapper"]',
    );
    expect(wrapper).not.toBeNull();
    expect(wrapper!.classList.contains('cyberismo-svg-wrapper')).toBe(true);
    expect(wrapper!.querySelector('svg#diagram')).not.toBeNull();

    const controls = wrapper!.querySelector('[data-cy="svg-controls"]');
    expect(controls).not.toBeNull();
    expect(controls!.querySelector('[aria-label="fullscreen"]')).not.toBeNull();
    expect(controls!.querySelector('[aria-label="download"]')).not.toBeNull();
  });

  it('does not duplicate controls when re-rendered', () => {
    const { container, rerender } = render(
      wrap(
        <SvgWrapper>
          <svg viewBox="0 0 10 10" />
        </SvgWrapper>,
      ),
    );
    rerender(
      wrap(
        <SvgWrapper>
          <svg viewBox="0 0 10 10" />
        </SvgWrapper>,
      ),
    );

    expect(container.querySelectorAll('[data-cy="svg-controls"]')).toHaveLength(
      1,
    );
  });

  it('leaves no controls behind when replaced by other content', () => {
    const { container, rerender } = render(
      wrap(
        <SvgWrapper>
          <svg viewBox="0 0 10 10" />
        </SvgWrapper>,
      ),
    );
    rerender(wrap(<div className="paragraph">plain text</div>));

    expect(container.querySelector('[data-cy="svg-controls"]')).toBeNull();
    expect(container.querySelectorAll('button')).toHaveLength(0);
  });

  it('opens the fullscreen viewer when the fullscreen control is clicked', () => {
    render(
      wrap(
        <SvgWrapper>
          <svg viewBox="0 0 10 10" />
        </SvgWrapper>,
      ),
    );

    fireEvent.click(screen.getByLabelText('fullscreen'));

    // The viewer modal renders the Cyberismo logo in its control bar
    expect(screen.getByAltText('Cyberismo')).toBeInTheDocument();
  });

  // Regression: the control buttons contain MUI icon <svg> elements that come
  // before the diagram in the DOM — the viewer must not pick those up.
  it('shows the diagram svg in the fullscreen viewer, not a control icon', () => {
    render(
      wrap(
        <SvgWrapper>
          <svg id="diagram" viewBox="0 0 10 10" />
        </SvgWrapper>,
      ),
    );

    fireEvent.click(screen.getByLabelText('fullscreen'));

    // The inline diagram plus its serialized copy inside the viewer modal
    expect(document.querySelectorAll('svg#diagram')).toHaveLength(2);
  });
});
