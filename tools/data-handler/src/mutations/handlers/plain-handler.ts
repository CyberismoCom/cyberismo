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
 * Plain definition write: applies an edit via resource.update with no
 * consumer-side cascade. Routed to by key-wildcard ROUTES rows whose edits
 * have no dependent local state to rewrite.
 */
export class PlainHandler implements Handler {
  async apply(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'edit') {
      throw new Error('DefaultNoCascadeHandler only supports edits');
    }
    const { target, updateKey, operation } = ctx.input;
    const type = ctx.project.resources.extractType(
      `${target.prefix}/${target.type}/${target.identifier}`,
    );
    const resource = ctx.project.resources.byType(
      `${target.prefix}/${target.type}/${target.identifier}`,
      type,
    );
    if (!resource) {
      throw new Error('Resource not found');
    }
    await resource.update(updateKey, operation);
  }

  async applyCascade(): Promise<void> {}
}

/**
 * Plain resource delete: deletes resources of families without a cascading
 * delete handler. The base resource delete() already refuses when the resource
 * is still in use; no dependent local state is rewritten.
 */
export class PlainDeleteHandler implements Handler {
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

  async applyCascade(): Promise<void> {}
}
