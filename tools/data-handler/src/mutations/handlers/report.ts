// tools/data-handler/src/mutations/handlers/report.ts

import type { Handler, MutationContext } from '../handler.js';
import type { CascadePreview } from '../types.js';
import { resourceName, resourceNameToString } from '../../utils/resource-utils.js';
import {
  rewriteCalculationRefs,
  rewriteCardContentRefs,
  rewriteHandlebarRefs,
} from '../cascades/rewrite-refs.js';

export class ReportRenameHandler implements Handler {
  readonly isBreaking = true;

  matches(ctx: MutationContext): boolean {
    return (
      ctx.input.kind === 'rename' && ctx.input.target.type === 'reports'
    );
  }

  async preview(ctx: MutationContext): Promise<CascadePreview> {
    if (ctx.input.kind !== 'rename') {
      throw new Error('ReportRenameHandler: non-rename input');
    }
    const oldName = resourceNameToString(ctx.input.target);
    const cards = ctx.project
      .cards(undefined)
      .filter((c) => c.content?.includes(oldName));
    const templateCards = ctx.project
      .allTemplateCards()
      .filter((c) => c.content?.includes(oldName));
    return {
      affectedCardCount: cards.length + templateCards.length,
      affectedLinkCount: 0,
      affectedCalculationCount: 0,
      affectedHandlebarFileCount: 0,
      dataLossExpected: false,
      summary: `Renames report references in ${cards.length + templateCards.length} card content files.`,
    };
  }

  async applyCascade(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'rename') {
      throw new Error('ReportRenameHandler: non-rename input');
    }
    const oldName = resourceNameToString(ctx.input.target);
    const resource = ctx.project.resources.byType(oldName, 'reports');
    if (!resource) {
      throw new Error(`Report '${oldName}' not found`);
    }
    const newName = `${ctx.input.target.prefix}/reports/${ctx.input.newIdentifier}`;
    // Run the cascade before the rename so the scan still finds the old
    // name on disk. Handlebar scope is limited to this report's own .hbs
    // files.
    // TODO: compute accurate counts now that cascade is explicit
    const handleBarFiles = await resource.handleBarFiles();
    await rewriteHandlebarRefs(ctx.project, oldName, newName, handleBarFiles);
    await rewriteCalculationRefs(ctx.project, oldName, newName);
    await rewriteCardContentRefs(ctx.project, oldName, newName);
  }

  async applyResourceOp(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'rename') {
      throw new Error('ReportRenameHandler: non-rename input');
    }
    const oldName = resourceNameToString(ctx.input.target);
    const resource = ctx.project.resources.byType(oldName, 'reports');
    if (!resource) {
      throw new Error(`Report '${oldName}' not found`);
    }
    const newName = `${ctx.input.target.prefix}/reports/${ctx.input.newIdentifier}`;
    await resource.rename(resourceName(newName));
  }

  async affectedFilePaths(ctx: MutationContext): Promise<string[]> {
    if (ctx.input.kind !== 'rename') return [];
    const oldName = resourceNameToString(ctx.input.target);
    return [
      ...ctx.project.cards(undefined),
      ...ctx.project.allTemplateCards(),
    ]
      .filter((c) => c.content?.includes(oldName))
      .map((c) => c.path);
  }
}

/**
 * Delete a report. Per migrations-plan.adoc: "No migration needed.
 * Existing references will be broken." The handler records the log
 * entry; downstream "interactive complete migration" can prompt the
 * user to replace broken references later.
 */
export class ReportDeleteHandler implements Handler {
  readonly isBreaking = true;

  matches(ctx: MutationContext): boolean {
    return (
      ctx.input.kind === 'delete' && ctx.input.target.type === 'reports'
    );
  }

  async preview(): Promise<CascadePreview> {
    return {
      affectedCardCount: 0,
      affectedLinkCount: 0,
      affectedCalculationCount: 0,
      affectedHandlebarFileCount: 0,
      dataLossExpected: false,
      summary:
        'No cascade. Existing references to this report will break until manually updated.',
    };
  }

  async applyCascade(_ctx: MutationContext): Promise<void> {}

  async applyResourceOp(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'delete') {
      throw new Error('ReportDeleteHandler: non-delete input');
    }
    const name = resourceNameToString(ctx.input.target);
    const resource = ctx.project.resources.byType(name, 'reports');
    if (!resource) {
      throw new Error(`Report '${name}' not found`);
    }
    await resource.delete();
  }

  async affectedFilePaths(): Promise<string[]> {
    return [];
  }
}
