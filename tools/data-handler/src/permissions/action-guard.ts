/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import type { Calculate } from '../commands/index.js';
import type { DeniedOperationCollection } from '../types/queries.js';

export type Action = keyof DeniedOperationCollection;

function checkOperation<T extends { errorMessage: string }>(data: Array<T>) {
  if (data.length > 0) {
    throw new Error(data.map((value) => value.errorMessage).join('; '));
  }
}

/**
 * This class is used to guard actions from being used without permissions
 */
export class ActionGuard {
  constructor(private calculate: Calculate) {}

  /**
   * Checks whether an action can be done
   * @param action Action that will be done
   * @param cardKey Key of the card being targeted
   * @param param  Required or not used param depending on the action
   */
  public async checkPermission(
    action: Action,
    cardKey: string,
    param?: string,
  ) {
    await this.calculate.generate();
    const cards = await this.calculate.runQuery('card', 'localApp', {
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
}
