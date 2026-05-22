// tools/data-handler/src/mutations/handlers/graph-view.ts

import type { Handler, MutationContext } from '../handler.js';
import type { CascadePreview } from '../types.js';
import { resourceName, resourceNameToString } from '../../utils/resource-utils.js';
import {
  rewriteCalculationRefs,
  rewriteCardContentRefs,
  rewriteHandlebarRefs,
} from '../cascades/rewrite-refs.js';

export class GraphViewRenameHandler implements Handler {
  readonly isBreaking = true;

  matches(ctx: MutationContext): boolean {
    return (
      ctx.input.kind === 'rename' && ctx.input.target.type === 'graphViews'
    );
  }

  async preview(ctx: MutationContext): Promise<CascadePreview> {
    if (ctx.input.kind !== 'rename') {
      throw new Error('GraphViewRenameHandler: non-rename input');
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
      summary: `Renames graph-view references in ${cards.length} cards.`,
    };
  }

  async apply(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'rename') {
      throw new Error('GraphViewRenameHandler: non-rename input');
    }
    const oldName = resourceNameToString(ctx.input.target);
    const resource = ctx.project.resources.byType(oldName, 'graphViews');
    if (!resource) {
      throw new Error(`Graph view '${oldName}' not found`);
    }
    const newName = `${ctx.input.target.prefix}/graphViews/${ctx.input.newIdentifier}`;
    // Run the cascade before the rename so the scan still finds the old
    // name on disk. Mirrors GraphViewResource.onNameChange — handlebar
    // scope is limited to this graph view's own .hbs file (same
    // construction the subclass previously used).
    // TODO: compute accurate counts now that cascade is explicit
    const handleBarFiles = [await resource.handleBarFile()];
    await rewriteHandlebarRefs(ctx.project, oldName, newName, handleBarFiles);
    await rewriteCalculationRefs(ctx.project, oldName, newName);
    await rewriteCardContentRefs(ctx.project, oldName, newName);
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
 * Delete a graph view. Per migrations-plan.adoc: "No migration.
 * Existing graph macros will be broken." The handler removes the
 * resource; the preview surfaces the broken-references warning.
 */
export class GraphViewDeleteHandler implements Handler {
  readonly isBreaking = true;

  matches(ctx: MutationContext): boolean {
    return (
      ctx.input.kind === 'delete' && ctx.input.target.type === 'graphViews'
    );
  }

  async preview(ctx: MutationContext): Promise<CascadePreview> {
    if (ctx.input.kind !== 'delete') {
      throw new Error('GraphViewDeleteHandler: non-delete input');
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
      summary: `Removes the graph view. ${refs} cards reference it; their graph macros will fail until updated.`,
    };
  }

  async apply(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'delete') {
      throw new Error('GraphViewDeleteHandler: non-delete input');
    }
    const name = resourceNameToString(ctx.input.target);
    const resource = ctx.project.resources.byType(name, 'graphViews');
    if (!resource) {
      throw new Error(`Graph view '${name}' not found`);
    }
    await resource.delete();
  }

  async affectedFilePaths(): Promise<string[]> {
    return [];
  }
}
