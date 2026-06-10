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

/** Plural resource-folder types whose rename cascade lives in the resource. */
type LeafResourceType =
  | 'calculations'
  | 'reports'
  | 'graphModels'
  | 'graphViews'
  | 'templates';

/**
 * Renames a leaf resource (calculation, report, graph model, graph view or
 * template). The resource class's rename performs the cascade, rewriting
 * references to the old name. The operation is marked breaking so a log entry
 * is recorded.
 *
 * Renaming a template does not flush the template-card cache (only deletion
 * does).
 */
export class LeafResourceRenameHandler implements Handler {
  readonly isBreaking = true;

  constructor(
    private readonly type: LeafResourceType,
    private readonly label: string,
  ) {}

  matches(ctx: MutationContext): boolean {
    return ctx.input.kind === 'rename' && ctx.input.target.type === this.type;
  }

  async apply(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'rename') {
      throw new Error('LeafResourceRenameHandler called with non-rename input');
    }
    const oldName = resourceNameToString(ctx.input.target);
    const newName = `${ctx.input.target.prefix}/${this.type}/${ctx.input.newIdentifier}`;

    const resource = ctx.project.resources.byType(oldName, this.type);
    if (!resource) {
      throw new Error(`${this.label} '${oldName}' not found`);
    }
    await resource.rename(resourceName(newName));
  }
}
