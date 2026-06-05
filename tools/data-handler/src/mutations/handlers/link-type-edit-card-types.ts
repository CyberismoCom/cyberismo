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

import type { Handler, MutationContext } from '../handler.js';
import { resourceNameToString } from '../../utils/resource-utils.js';

/**
 * Handles edits to a link type's `sourceCardTypes` / `destinationCardTypes`
 * arrays. This does not rewrite card data, so it is non-breaking and emits no
 * cascade. Adding a card type is not validated for existence — only duplicates
 * are rejected (by ArrayHandler).
 */
export class LinkTypeEditCardTypesHandler implements Handler {
  readonly isBreaking = false;

  matches(ctx: MutationContext): boolean {
    if (ctx.input.kind !== 'edit') return false;
    if (ctx.input.target.type !== 'linkTypes') return false;
    const { key } = ctx.input.updateKey;
    return key === 'sourceCardTypes' || key === 'destinationCardTypes';
  }

  async apply(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'edit') {
      throw new Error(
        'LinkTypeEditCardTypesHandler called with non-edit input',
      );
    }
    const name = resourceNameToString(ctx.input.target);
    const resource = ctx.project.resources.byType(name, 'linkTypes');
    if (!resource) {
      throw new Error(`Link type '${name}' not found`);
    }
    await resource.update(ctx.input.updateKey, ctx.input.operation);
  }
}
