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

/**
 * Renaming a field type is a breaking change: card-content references,
 * calculations, handlebars and the customFields[].name entries on every
 * referencing card type are rewritten. The cascade is performed by
 * FieldTypeResource.rename; this handler delegates to resource.rename() and
 * marks the operation breaking so the engine records a log entry.
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
    await resource.rename(resourceName(newName));
  }
}
