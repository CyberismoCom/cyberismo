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
import type { MutationInput } from './types.js';
import type { ChangeClassification } from './registry.js';
import { ROUTES } from './registry.js';
import type { RouteKey } from './route.js';
import { route, routeKeyString } from './route.js';

const MAP = new Map<
  string,
  { handler: Handler; classification: ChangeClassification }
>();
for (const r of ROUTES) {
  const s = routeKeyString(r.route);
  if (MAP.has(s)) throw new Error(`Duplicate route registration: ${s}`);
  MAP.set(s, { handler: r.handler, classification: r.classification });
}

/**
 * Test-only override registered ahead of the declarative MAP. Carries its own
 * matches()/classification so tests keep classifying inputs directly, while
 * the production Handler interface no longer exposes them.
 */
interface TestOverride {
  matches(input: MutationInput): boolean;
  readonly classification: ChangeClassification;
  apply: Handler['apply'];
  applyCascade: Handler['applyCascade'];
}

const TEST_OVERRIDES: TestOverride[] = [];

function lookup(
  k: RouteKey,
): { handler: Handler; classification: ChangeClassification } | undefined {
  const exact = MAP.get(routeKeyString(k));
  if (exact) return exact;
  if (k.kind === 'edit') {
    return MAP.get(routeKeyString({ ...k, op: undefined }));
  }
  return undefined;
}

// The single resolution path behind dispatch() and classify(), so the handler
// an input runs through and the class it is gated by cannot disagree.
function resolve(
  input: MutationInput,
): { handler: Handler; classification: ChangeClassification } | undefined {
  for (const override of TEST_OVERRIDES) {
    if (override.matches(input)) {
      return { handler: override, classification: override.classification };
    }
  }
  return lookup(route(input));
}

export function dispatch(ctx: MutationContext): {
  handler: Handler;
  classification: ChangeClassification;
} {
  const found = resolve(ctx.input);
  if (found) return found;
  throw new Error(
    `No mutation handler for input: ${JSON.stringify(ctx.input)}`,
  );
}

/** Migration-policy class of an input, from the same table dispatch uses. */
export function classify(input: MutationInput): ChangeClassification {
  const found = resolve(input);
  if (found) return found.classification;
  throw new Error(`No mutation route for input: ${JSON.stringify(input)}`);
}

/** Test-only escape hatch for registering a handler ahead of the routes. */
export function _registerHandlerForTest(handler: TestOverride): () => void {
  TEST_OVERRIDES.unshift(handler);
  return () => {
    const idx = TEST_OVERRIDES.indexOf(handler);
    if (idx >= 0) TEST_OVERRIDES.splice(idx, 1);
  };
}
