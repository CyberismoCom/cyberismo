// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { Handler, MutationContext } from '../handler.js';
import type { DeleteInput, EditInput } from '../types.js';

export class PlainHandler implements Handler<EditInput> {
  async apply(ctx: MutationContext<EditInput>): Promise<void> {
    const { target, updateKey, operation } = ctx.input;
    const type = ctx.checkout.resources.extractType(
      `${target.prefix}/${target.type}/${target.identifier}`,
    );
    const resource = ctx.checkout.resources.byType(
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

export class PlainDeleteHandler implements Handler<DeleteInput> {
  async apply(ctx: MutationContext<DeleteInput>): Promise<void> {
    const { target } = ctx.input;
    const name = `${target.prefix}/${target.type}/${target.identifier}`;
    const type = ctx.checkout.resources.extractType(name);
    const resource = ctx.checkout.resources.byType(name, type);
    if (!resource) {
      throw new Error(`Resource '${name}' not found`);
    }
    await resource.delete();
  }

  async applyCascade(): Promise<void> {}
}
