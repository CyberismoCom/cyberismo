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
import {
  rewriteCardContentRefs,
  rewriteContentFileRefs,
} from '../cascades/rewrite-refs.js';
import type { ChangeOperation } from '../../resources/resource-object.js';

/**
 * Renaming a workflow is a breaking change: dependent card types' workflow
 * reference and all cross-resource references (calculations, report handlebars
 * and card content) must be rewritten. The operation is marked breaking so the
 * engine records a log entry.
 */
export class WorkflowRenameHandler implements Handler {
  readonly isBreaking = true;

  matches(ctx: MutationContext): boolean {
    return ctx.input.kind === 'rename' && ctx.input.target.type === 'workflows';
  }

  async apply(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'rename') {
      throw new Error('WorkflowRenameHandler called with non-rename input');
    }
    const oldName = resourceNameToString(ctx.input.target);
    const newName = `${ctx.input.target.prefix}/workflows/${ctx.input.newIdentifier}`;

    const resource = ctx.project.resources.byType(oldName, 'workflows');
    if (!resource) {
      throw new Error(`Workflow '${oldName}' not found`);
    }

    // Rename the resource itself first. WorkflowResource.rename only renames
    // the metadata file and the in-memory name (and validates the new
    // identifier); it no longer cascades.
    await resource.rename(ctx.input.newIdentifier);

    // Cascade the rename across the project, after the resource file has been
    // renamed: the cascade scanners look for the old name in card content /
    // calculations / handlebars and in card types' `workflow` reference, none
    // of which the file rename touched.
    await Promise.all([
      rewriteContentFileRefs(ctx.project, oldName, newName),
      rewriteCardContentRefs(ctx.project, oldName, newName),
      this.updateCardTypes(ctx, oldName, newName),
    ]);
  }

  // Rewrite the `workflow` reference on every card type that points at the
  // renamed workflow.
  private async updateCardTypes(
    ctx: MutationContext,
    oldName: string,
    newName: string,
  ): Promise<void> {
    const cardTypes = ctx.project.resources.cardTypes();
    const op = {
      name: 'change',
      target: oldName,
      to: newName,
    } as ChangeOperation<string>;
    for (const cardType of cardTypes) {
      if (cardType.data?.workflow === oldName) {
        await cardType.update({ key: 'workflow' }, op);
      }
    }
  }
}
