// tools/data-handler/src/mutations/handlers/graph-model.ts

import { join } from 'node:path';

import type { Handler, MutationContext } from '../handler.js';
import type { CascadePreview } from '../types.js';
import { resourceName, resourceNameToString } from '../../utils/resource-utils.js';
import { CONTENT_FILES } from '../../interfaces/folder-content-interfaces.js';
import {
  rewriteCalculationRefs,
  rewriteCardContentRefs,
  rewriteHandlebarRefs,
} from '../cascades/rewrite-refs.js';

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

  async applyCascade(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'rename') {
      throw new Error('GraphModelRenameHandler: non-rename input');
    }
    const oldName = resourceNameToString(ctx.input.target);
    const newName = `${ctx.input.target.prefix}/graphModels/${ctx.input.newIdentifier}`;
    // Run the cascade before the rename so the scan still finds the old
    // name on disk. Handlebar scope is limited to this graph model's
    // model.hbs file.
    // TODO: compute accurate counts now that cascade is explicit
    const internalFolder = join(
      ctx.project.paths.resourcePath('graphModels'),
      ctx.input.target.identifier,
    );
    const handleBarFiles = [join(internalFolder, CONTENT_FILES.model)];
    await rewriteHandlebarRefs(ctx.project, oldName, newName, handleBarFiles);
    await rewriteCalculationRefs(ctx.project, oldName, newName);
    await rewriteCardContentRefs(ctx.project, oldName, newName);
  }

  async applyResourceOp(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'rename') {
      throw new Error('GraphModelRenameHandler: non-rename input');
    }
    const oldName = resourceNameToString(ctx.input.target);
    const resource = ctx.project.resources.byType(oldName, 'graphModels');
    if (!resource) {
      throw new Error(`Graph model '${oldName}' not found`);
    }
    const newName = `${ctx.input.target.prefix}/graphModels/${ctx.input.newIdentifier}`;
    await resource.rename(resourceName(newName));
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

  async applyCascade(): Promise<void> {}

  async applyResourceOp(ctx: MutationContext): Promise<void> {
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
