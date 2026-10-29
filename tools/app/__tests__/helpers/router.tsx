// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { vi } from 'vitest';
import { BrowserRouter } from 'react-router';
import type { ReactNode } from 'react';

/**
 * A stubbed `useAppRouter` return value. Call inside a
 * `vi.mock('@/lib/hooks', ...)` factory:
 *
 *   const { mockAppRouter } = await import('./helpers/router');
 *   return { ...actual, useAppRouter: vi.fn(mockAppRouter) };
 *
 * Pass your own `push` when the navigation target has to be asserted — a fresh
 * mock is created per call, so the one here cannot be inspected afterwards.
 */
export const mockAppRouter = () => ({
  push: vi.fn(),
});

/** Wrap UI in a router so components using router hooks can render. */
export const withRouter = (ui: ReactNode) => (
  <BrowserRouter>{ui}</BrowserRouter>
);
