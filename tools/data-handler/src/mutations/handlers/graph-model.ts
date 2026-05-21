// tools/data-handler/src/mutations/handlers/graph-model.ts

import type { Handler, MutationContext } from '../handler.js';
import type { CascadePreview } from '../types.js';
import { resourceNameToString } from '../../utils/resource-utils.js';

export class GraphModelRenameHandler implements Handler {
  readonly isBreaking = true;

  matches(ctx: MutationContext): boolean {
    return (
      ctx.input.kind === 'rename' && ctx.input.target.type === 'graphModels'
    );
  }

  async preview(ctx: MutationContext): Promise<CascadePreview> {
    if (ctx.input.kind !== 'rename') {
      throw new Error('GraphModelRenameHandler: non-rename input');
    }
    const oldName = resourceNameToString(ctx.input.target);
    const cards = ctx.project
      .cards(undefined)
      .filter((c) => c.content?.includes(oldName));
    return {
      affectedCardCount: cards.length,
      affectedLinkCount: 0,
      affectedCalculationCount: 0,
      affectedHandlebarFileCount: 0,
      dataLossExpected: false,
      summary: `Renames graph-model references in ${cards.length} cards.`,
    };
  }

  async apply(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'rename') {
      throw new Error('GraphModelRenameHandler: non-rename input');
    }
    const oldName = resourceNameToString(ctx.input.target);
    const resource = ctx.project.resources.byType(oldName, 'graphModels');
    if (!resource) {
      throw new Error(`Graph model '${oldName}' not found`);
    }
    const newName = `${ctx.input.target.prefix}/graphModels/${ctx.input.newIdentifier}`;
    await resource.update(
      { key: 'name' },
      { name: 'change', target: oldName, to: newName },
    );
  }

  async affectedFilePaths(ctx: MutationContext): Promise<string[]> {
    if (ctx.input.kind !== 'rename') return [];
    const oldName = resourceNameToString(ctx.input.target);
    return ctx.project
      .cards(undefined)
      .filter((c) => c.content?.includes(oldName))
      .map((c) => c.path);
  }
}

/**
 * Delete a graph model. Per migrations-plan.adoc: "Warn that content
 * may be broken, remove the model." The handler removes the resource;
 * the warning is conveyed via the preview summary.
 */
export class GraphModelDeleteHandler implements Handler {
  readonly isBreaking = true;

  matches(ctx: MutationContext): boolean {
    return (
      ctx.input.kind === 'delete' && ctx.input.target.type === 'graphModels'
    );
  }

  async preview(ctx: MutationContext): Promise<CascadePreview> {
    if (ctx.input.kind !== 'delete') {
      throw new Error('GraphModelDeleteHandler: non-delete input');
    }
    const name = resourceNameToString(ctx.input.target);
    const refs = ctx.project
      .cards(undefined)
      .filter((c) => c.content?.includes(name)).length;
    return {
      affectedCardCount: refs,
      affectedLinkCount: 0,
      affectedCalculationCount: 0,
      affectedHandlebarFileCount: 0,
      dataLossExpected: false,
      summary: `Removes the graph model. ${refs} cards reference it and may render broken content until updated.`,
    };
  }

  async apply(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'delete') {
      throw new Error('GraphModelDeleteHandler: non-delete input');
    }
    const name = resourceNameToString(ctx.input.target);
    const resource = ctx.project.resources.byType(name, 'graphModels');
    if (!resource) {
      throw new Error(`Graph model '${name}' not found`);
    }
    await resource.delete();
  }

  async affectedFilePaths(): Promise<string[]> {
    return [];
  }
}
