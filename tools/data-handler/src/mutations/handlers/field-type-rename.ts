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
import {
  resourceName,
  resourceNameToString,
} from '../../utils/resource-utils.js';
import {
  rewriteCardContentRefs,
  rewriteContentFileRefs,
} from '../cascades/rewrite-refs.js';
import type { ChangeOperation } from '../../resources/resource-object.js';

/**
 * Renaming a field type is a breaking change: card-content references,
 * calculations, report handlebars and the customFields[].name entries on every
 * referencing card type are rewritten. The cascade used to live in
 * FieldTypeResource.rename / onNameChange; it now lives here, mirroring
 * CardTypeRenameHandler. The operation is marked breaking so the engine records
 * a log entry.
 */
export class FieldTypeRenameHandler implements Handler {
  readonly isBreaking = true;

  matches(ctx: MutationContext): boolean {
    return (
      ctx.input.kind === 'rename' && ctx.input.target.type === 'fieldTypes'
    );
  }

  async apply(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'rename') {
      throw new Error('FieldTypeRenameHandler called with non-rename input');
    }
    const oldName = resourceNameToString(ctx.input.target);
    const newName = `${ctx.input.target.prefix}/fieldTypes/${ctx.input.newIdentifier}`;

    const resource = ctx.project.resources.byType(oldName, 'fieldTypes');
    if (!resource) {
      throw new Error(`Field type '${oldName}' not found`);
    }

    // Rename the resource itself first. FieldTypeResource.rename only renames
    // the metadata file and the in-memory name; it no longer cascades.
    await resource.rename(resourceName(newName));

    // Cascade the rename across the project. These rewrites previously ran in
    // FieldTypeResource.onNameChange (after the resource file was renamed), so
    // they run after resource.rename() here too. updateCardTypes re-validates
    // the field reference against the project, which is why renaming a field
    // still referenced by a card type is rejected.
    await Promise.all([
      rewriteContentFileRefs(ctx.project, oldName, newName),
      rewriteCardContentRefs(ctx.project, oldName, newName),
      this.updateCardTypes(ctx, oldName, newName),
    ]);
  }

  // Rewrite every card type's customFields entry that references the renamed
  // field type. Mirrors FieldTypeResource's former updateCardTypes cascade.
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
      const found = cardType.data?.customFields?.find(
        (item) => item.name === oldName,
      );
      if (found) {
        await cardType.update({ key: 'customFields' }, op);
      }
    }
  }
}
