// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { Handler, MutationContext } from '../handler.js';
import type { RenameInput } from '../types.js';
import { resourceNameToString } from '../../../../shared/utils/resource-utils.js';
import { ResourcesFrom } from '../../../../state/resources/resources-from.js';
import {
  rewriteCardContentRefs,
  rewriteContentFileRefs,
} from '../cascades/rewrite-refs.js';
import type { ChangeOperation } from '@cyberismo/model';

/**
 * Renaming a workflow rewrites dependent card types' workflow reference and
 * all cross-resource references (calculations, report handlebars and card
 * content).
 */
export class WorkflowRenameHandler implements Handler<RenameInput> {
  async apply(ctx: MutationContext<RenameInput>): Promise<void> {
    const oldName = resourceNameToString(ctx.input.target);

    const resource = ctx.checkout.resources.byType(oldName, 'workflows');
    if (!resource) {
      throw new Error(`Workflow '${oldName}' not found`);
    }

    // Rename the resource itself first. WorkflowResource.rename only renames
    // the metadata file and the in-memory name (and validates the new
    // identifier); it does not cascade.
    await resource.rename(ctx.input.newIdentifier);

    await this.applyCascade(ctx);
  }

  async applyCascade(ctx: MutationContext<RenameInput>): Promise<void> {
    const oldName = resourceNameToString(ctx.input.target);
    const newName = `${ctx.input.target.prefix}/workflows/${ctx.input.newIdentifier}`;

    await Promise.all([
      rewriteContentFileRefs(ctx.checkout, oldName, newName),
      rewriteCardContentRefs(ctx.checkout, oldName, newName),
      this.updateCardTypes(ctx, oldName, newName),
    ]);
  }

  // Rewrite the `workflow` reference on every LOCAL card type that points at
  // the renamed workflow. Module-owned card types are immutable from the
  // consumer side; their references are the owning module's responsibility.
  private async updateCardTypes(
    ctx: MutationContext,
    oldName: string,
    newName: string,
  ): Promise<void> {
    const cardTypes = ctx.checkout.resources.cardTypes(ResourcesFrom.localOnly);
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
