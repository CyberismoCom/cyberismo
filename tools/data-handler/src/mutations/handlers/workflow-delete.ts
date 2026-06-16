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
import type { DeleteInput } from '../types.js';
import { resourceNameToString } from '../../utils/resource-utils.js';
import { ResourcesFrom } from '../../containers/project/resources-from.js';
import { deleteCardType } from '../cascades/delete-card-type.js';

/**
 * Deleting a workflow is a breaking change. A card type requires a workflow, so
 * there is no clean "strip" — every local card type that references the deleted
 * workflow is itself deleted (which cascades to deleting all of its cards). The
 * handler owns this cascade; resource.delete() is a pure primitive that no
 * longer refuses on usage.
 */
export class WorkflowDeleteHandler implements Handler<DeleteInput> {
  async apply(ctx: MutationContext<DeleteInput>): Promise<void> {
    const name = resourceNameToString(ctx.input.target);

    // Interactive deletion of a module-owned workflow is not allowed.
    if (ctx.input.target.prefix !== ctx.project.projectPrefix) {
      throw new Error(
        `Cannot delete resource ${name}: It is a module resource`,
      );
    }

    // Delete dependent card types (and their cards) first, then the workflow.
    await this.applyCascade(ctx);

    const resource = ctx.project.resources.byType(name, 'workflows');
    if (!resource) throw new Error(`Workflow '${name}' not found`);
    await resource.delete();
  }

  // Cascade: delete every local card type that uses this workflow. Each card
  // type deletion removes the card type resource and all of its cards.
  async applyCascade(ctx: MutationContext<DeleteInput>): Promise<void> {
    const name = resourceNameToString(ctx.input.target);
    const dependentCardTypes = ctx.project.resources
      .cardTypes(ResourcesFrom.localOnly)
      .filter((ct) => ct.data?.workflow === name)
      .map((ct) => ct.data!.name);

    for (const cardTypeName of dependentCardTypes) {
      await deleteCardType(ctx, cardTypeName);
    }
  }
}
