// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import TwoColumnLayout from '@/components/TwoColumnLayout';

// INTDEV-1512: the right panel holds the open page, including an editor's
// unsaved draft. Crossing the collapse breakpoint must not remount it.

// jsdom has no matchMedia. Every max-width query matches while `narrow` is set.
let narrow = false;
const listeners = new Set<() => void>();

function setNarrow(value: boolean) {
  narrow = value;
  act(() => listeners.forEach((listener) => listener()));
}

beforeEach(() => {
  narrow = false;
  listeners.clear();
  // The resizable panels observe their size; jsdom has no layout to observe.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches() {
      return narrow && query.includes('max-width');
    },
    media: query,
    addEventListener: (_: string, listener: () => void) =>
      listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) =>
      listeners.delete(listener),
    addListener: (listener: () => void) => listeners.add(listener),
    removeListener: (listener: () => void) => listeners.delete(listener),
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('TwoColumnLayout', () => {
  it('keeps the right panel mounted across the collapse breakpoint', () => {
    render(
      <TwoColumnLayout
        collapseBelow="md"
        leftPanel={<nav>menu</nav>}
        rightPanel={<input aria-label="draft" />}
      />,
    );
    const draft = () => screen.getByLabelText('draft') as HTMLInputElement;
    fireEvent.change(draft(), { target: { value: 'unsaved' } });

    // Collapsed, the left panel moves into a drawer and the resize handle goes.
    setNarrow(true);
    expect(screen.queryByRole('separator')).toBeNull();
    expect(draft().value).toBe('unsaved');

    setNarrow(false);
    expect(screen.getByRole('separator')).toBeInTheDocument();
    expect(draft().value).toBe('unsaved');
  });
});
