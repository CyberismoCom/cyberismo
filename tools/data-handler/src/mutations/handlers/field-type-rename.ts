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
import { ResourcesFrom } from '../../containers/project/resources-from.js';
import {
  rewriteCardContentRefs,
  rewriteContentFileRefs,
} from '../cascades/rewrite-refs.js';
import type { ChangeOperation } from '../../resources/resource-object.js';

/**
 * Renaming a field type is a breaking change: card-content references,
 * calculations, report handlebars and the customFields[].name entries on every
 * referencing card type are rewritten. The operation is marked breaking so the
 * engine records a log entry.
 */
export class FieldTypeRenameHandler implements Handler {
  async apply(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'rename') {
      throw new Error('FieldTypeRenameHandler called with non-rename input');
    }
    const oldName = resourceNameToString(ctx.input.target);

    const resource = ctx.project.resources.byType(oldName, 'fieldTypes');
    if (!resource) {
      throw new Error(`Field type '${oldName}' not found`);
    }

    // Rename the resource itself first. FieldTypeResource.rename only renames
    // the metadata file and the in-memory name; it no longer cascades.
    await resource.rename(ctx.input.newIdentifier);

    // The cascade must run AFTER the rename (unlike card-type-rename's
    // cascade-first order): updateCardTypes goes through cardType.update,
    // whose validateFieldType re-checks the changed field reference against
    // the project. With the old name already gone, renaming a field type that
    // a card type still references is rejected — behavior pinned by tests.
    await this.applyCascade(ctx);
  }

  async applyCascade(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'rename') {
      throw new Error('FieldTypeRenameHandler called with non-rename input');
    }
    const oldName = resourceNameToString(ctx.input.target);
    const newName = `${ctx.input.target.prefix}/fieldTypes/${ctx.input.newIdentifier}`;

    await Promise.all([
      rewriteContentFileRefs(ctx.project, oldName, newName),
      rewriteCardContentRefs(ctx.project, oldName, newName),
      this.updateCardTypes(ctx, oldName, newName),
    ]);
  }

  // Rewrite every LOCAL card type's customFields entry that references the
  // renamed field type. Module-owned card types are immutable from the
  // consumer side; their references are the owning module's responsibility.
  private async updateCardTypes(
    ctx: MutationContext,
    oldName: string,
    newName: string,
  ): Promise<void> {
    const cardTypes = ctx.project.resources.cardTypes(ResourcesFrom.localOnly);
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
