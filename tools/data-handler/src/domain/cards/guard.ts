/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import type { Checkout } from '../../infra/checkout.js';
import type { DeniedOperationCollection } from '@cyberismo/model';
import { PermissionDeniedError } from '../../shared/exceptions/index.js';

export type Action = keyof DeniedOperationCollection;

function checkOperation<T extends { errorMessage: string }>(data: Array<T>) {
  if (data.length > 0) {
    throw new PermissionDeniedError(data.map((value) => value.errorMessage));
  }
}

/**
 * Throws PermissionDeniedError when the card's calculated denied operations
 * forbid `action`; `param` names the transition or field it applies to.
 */
export async function assertAllowed(
  checkout: Checkout,
  action: Action,
  cardKey: string,
  param?: string,
) {
  const cards = await checkout.calculationEngine.runQuery('card', 'localApp', {
    cardKey,
  });
  if (cards.length === 0) {
    throw new Error("Card query didn't return results");
  }
  if (cards.length !== 1) {
    throw new Error('Card query returned multiple cards');
  }
  const res = cards[0];
  if (action === 'editContent') {
    return checkOperation(res.deniedOperations.editContent);
  }
  if (action === 'transition') {
    return checkOperation(
      res.deniedOperations.transition.filter(
        (value) => value.transitionName === param,
      ),
    );
  }
  if (action === 'delete') {
    return checkOperation(res.deniedOperations.delete);
  }
  if (action === 'editField') {
    return checkOperation(
      res.deniedOperations.editField.filter(
        (value) => value.fieldName === param,
      ),
    );
  }
  if (action === 'move') {
    return checkOperation(res.deniedOperations.move);
  }
  throw new Error(`Action: ${action} does not support checking permissions`);
}
