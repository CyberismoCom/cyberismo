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
