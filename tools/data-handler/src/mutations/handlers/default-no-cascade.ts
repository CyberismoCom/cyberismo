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

export class DefaultNoCascadeHandler implements Handler {
  readonly isBreaking = false;

  matches(ctx: MutationContext): boolean {
    // Catch-all: dispatcher consults specific handlers first.
    return ctx.input.kind === 'edit';
  }

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

  // No cascade: edits matched by this catch-all have no dependent local
  // state to rewrite.
  async applyCascade(): Promise<void> {}
}
