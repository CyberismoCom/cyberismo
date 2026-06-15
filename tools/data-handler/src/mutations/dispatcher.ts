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

import type { Handler, MutationContext } from './handler.js';
import { ROUTES } from './registry.js';
import { route, routeKeyString } from './route.js';

const MAP = new Map<string, { handler: Handler; breaking: boolean }>();
for (const r of ROUTES) {
  const s = routeKeyString(r.route);
  if (MAP.has(s)) throw new Error(`Duplicate route registration: ${s}`);
  MAP.set(s, { handler: r.handler, breaking: r.breaking });
}

/**
 * Test-only override registered ahead of the declarative MAP. Carries its own
 * matches()/isBreaking so tests keep classifying inputs directly, while the
 * production Handler interface no longer exposes them.
 */
interface TestOverride {
  matches(ctx: MutationContext): boolean;
  readonly isBreaking: boolean;
  apply: Handler['apply'];
  applyCascade: Handler['applyCascade'];
}

const TEST_OVERRIDES: TestOverride[] = [];

export function dispatch(ctx: MutationContext): {
  handler: Handler;
  breaking: boolean;
} {
  for (const override of TEST_OVERRIDES) {
    if (override.matches(ctx)) {
      return { handler: override, breaking: override.isBreaking };
    }
  }
  const k = route(ctx.input);
  const exact = MAP.get(routeKeyString(k));
  if (exact) return exact;
  if (k.kind === 'edit') {
    const wildcard = MAP.get(routeKeyString({ ...k, op: undefined }));
    if (wildcard) return wildcard;
  }
  throw new Error(
    `No mutation handler for input: ${JSON.stringify(ctx.input)}`,
  );
}

/** Test-only escape hatch for registering a handler ahead of the routes. */
export function _registerHandlerForTest(handler: TestOverride): () => void {
  TEST_OVERRIDES.unshift(handler);
  return () => {
    const idx = TEST_OVERRIDES.indexOf(handler);
    if (idx >= 0) TEST_OVERRIDES.splice(idx, 1);
  };
}
