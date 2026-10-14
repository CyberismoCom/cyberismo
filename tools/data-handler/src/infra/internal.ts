/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2026

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

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
