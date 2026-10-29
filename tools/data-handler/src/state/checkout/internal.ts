// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { Checkout } from './checkout.js';

// Keyed by the Workspace handle. infra/ may not import workspace/, so the
// key type is `object`.
const checkouts = new WeakMap<object, Checkout>();

/** Records the checkout a workspace handle works on. */
export function setCheckout(ws: object, checkout: Checkout): void {
  checkouts.set(ws, checkout);
}

/**
 * The checkout a workspace handle works on. Internal to data-handler: not
 * exported from the package.
 */
export function checkoutOf(ws: object): Checkout {
  const checkout = checkouts.get(ws);
  if (!checkout) {
    throw new Error('Not a workspace handle');
  }
  return checkout;
}
