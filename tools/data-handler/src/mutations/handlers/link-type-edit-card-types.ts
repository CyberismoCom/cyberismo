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
 * arrays. Updating these arrays does not rewrite any card data, so the change
 * is non-breaking (isBreaking = false) and emits no cascade.
 *
 * This is a thin router: it delegates the array mutation to
 * LinkTypeResource.update, matching the legacy in-class behavior exactly. The
 * legacy update path performs no card-type existence check on 'add' (the only
 * guard is ArrayHandler's duplicate check), so this handler intentionally does
 * NOT validate that an added card type exists. See the PR report for the
 * parity rationale.
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
