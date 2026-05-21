// tools/data-handler/src/mutations/handlers/template.ts

import type { Handler, MutationContext } from '../handler.js';
import type { CascadePreview } from '../types.js';
import { resourceNameToString } from '../../utils/resource-utils.js';

/**
 * Rename a template. Cascade: rewrite references in card index.adoc
 * files (createCards macro), reports, and calculations.
 *
 * The cascade body delegates to TemplateResource.rename(), which calls
 * updateHandleBars / updateCalculations / updateCardContentReferences
 * via its onNameChange override. This handler is the orchestrator and
 * the source of the log entry; the resource subclass keeps the per-file
 * rewrite mechanics.
 */
export class TemplateRenameHandler implements Handler {
  readonly isBreaking = true;

  matches(ctx: MutationContext): boolean {
    return (
      ctx.input.kind === 'rename' && ctx.input.target.type === 'templates'
    );
  }

  async preview(ctx: MutationContext): Promise<CascadePreview> {
    if (ctx.input.kind !== 'rename') {
      throw new Error('TemplateRenameHandler: non-rename input');
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
      summary: `Renames ${cards.length + templateCards.length} createCards references.`,
    };
  }

  async apply(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'rename') {
      throw new Error('TemplateRenameHandler: non-rename input');
    }
    const oldName = resourceNameToString(ctx.input.target);
    const resource = ctx.project.resources.byType(oldName, 'templates');
    if (!resource) {
      throw new Error(`Template '${oldName}' not found`);
    }
    const newName = `${ctx.input.target.prefix}/templates/${ctx.input.newIdentifier}`;
    await resource.update(
      { key: 'name' },
      { name: 'change', target: oldName, to: newName },
    );
  }

  async affectedFilePaths(ctx: MutationContext): Promise<string[]> {
    if (ctx.input.kind !== 'rename') return [];
    const oldName = resourceNameToString(ctx.input.target);
    const paths: string[] = [];
    for (const card of ctx.project.cards(undefined)) {
      if (card.content?.includes(oldName)) paths.push(card.path);
    }
    for (const card of ctx.project.allTemplateCards()) {
      if (card.content?.includes(oldName)) paths.push(card.path);
    }
    return paths;
  }
}

/**
 * Delete a template. Per migrations-plan.adoc: "No migration needed
 * (only affects future card creation)." The handler still records the
 * log entry so consumers know the resource went away; the cascade is
 * empty.
 */
export class TemplateDeleteHandler implements Handler {
  readonly isBreaking = true;

  matches(ctx: MutationContext): boolean {
    return (
      ctx.input.kind === 'delete' && ctx.input.target.type === 'templates'
    );
  }

  async preview(): Promise<CascadePreview> {
    return {
      affectedCardCount: 0,
      affectedLinkCount: 0,
      affectedCalculationCount: 0,
      affectedHandlebarFileCount: 0,
      dataLossExpected: false,
      summary: 'No cascade. Future card creation from this template will fail.',
    };
  }

  async apply(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'delete') {
      throw new Error('TemplateDeleteHandler: non-delete input');
    }
    const name = resourceNameToString(ctx.input.target);
    const resource = ctx.project.resources.byType(name, 'templates');
    if (!resource) {
      throw new Error(`Template '${name}' not found`);
    }
    await resource.delete();
  }

  async affectedFilePaths(): Promise<string[]> {
    return [];
  }
}
