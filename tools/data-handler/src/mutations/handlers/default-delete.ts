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

/**
 * Deletes resources of families without a cascading delete handler
 * (calculations, reports, graph models, graph views, templates). The base
 * resource delete() already refuses when the resource is still in use; no
 * log entry is recorded.
 */
export class DefaultDeleteHandler implements Handler {
  readonly isBreaking = false;

  matches(ctx: MutationContext): boolean {
    // Catch-all: dispatcher consults family-specific delete handlers first.
    return ctx.input.kind === 'delete';
  }

  async apply(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'delete') {
      throw new Error('DefaultDeleteHandler only supports deletes');
    }
    const { target } = ctx.input;
    const name = `${target.prefix}/${target.type}/${target.identifier}`;
    const type = ctx.project.resources.extractType(name);
    const resource = ctx.project.resources.byType(name, type);
    if (!resource) {
      throw new Error(`Resource '${name}' not found`);
    }
    await resource.delete();
  }

  // No cascade: these families have no dependent local state; delete()
  // already refuses while the resource is still in use.
  async applyCascade(): Promise<void> {}
}
