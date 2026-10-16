// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { Handler, MutationContext } from './handler.js';
import type { MutationInput } from '@cyberismo/model';
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

/** Migration-policy class of an input. */
export function classify(input: MutationInput): ChangeClassification {
  const found = resolve(input);
  if (found) return found.classification;
  throw new Error(`No mutation route for input: ${JSON.stringify(input)}`);
}
