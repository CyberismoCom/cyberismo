// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { CreateParamsByType } from '@cyberismo/model';
import type { Handler, MutationContext } from '../handler.js';
import type { CreateInput } from '../types.js';

export class CreateHandler implements Handler<CreateInput> {
  async apply(ctx: MutationContext<CreateInput>): Promise<void> {
    const { target } = ctx.input;
    const resources = ctx.checkout.resources;
    switch (target.type) {
      case 'calculations': {
        const { content } = params<'calculations'>(ctx);
        return resources.byType<'calculations'>(target).create(content);
      }
      case 'cardTypes': {
        const { workflow } = params<'cardTypes'>(ctx);
        return resources.byType<'cardTypes'>(target).createCardType(workflow);
      }
      case 'fieldTypes': {
        const { dataType } = params<'fieldTypes'>(ctx);
        return resources.byType<'fieldTypes'>(target).createFieldType(dataType);
      }
      case 'graphModels': {
        const { content } = params<'graphModels'>(ctx);
        return resources.byType<'graphModels'>(target).create(content);
      }
      case 'graphViews':
        return resources.byType<'graphViews'>(target).create();
      case 'linkTypes': {
        const { content } = params<'linkTypes'>(ctx);
        return resources.byType<'linkTypes'>(target).create(content);
      }
      case 'reports':
        return resources.byType<'reports'>(target).createReport();
      case 'skills':
        return resources.byType<'skills'>(target).createSkill();
      case 'templates': {
        const { content } = params<'templates'>(ctx);
        return resources.byType<'templates'>(target).create(content);
      }
      case 'workflows': {
        const { content } = params<'workflows'>(ctx);
        return resources.byType<'workflows'>(target).create(content);
      }
    }
    throw new Error(`Cannot create resources of type '${target.type}'`);
  }

  async applyCascade(): Promise<void> {}
}

// The route guarantees the params match the target's type.
function params<T extends keyof CreateParamsByType>(
  ctx: MutationContext<CreateInput>,
): CreateParamsByType[T] {
  return ctx.input.params as CreateParamsByType[T];
}
