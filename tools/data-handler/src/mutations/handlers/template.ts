// tools/data-handler/src/mutations/handlers/template.ts

import type { Handler, MutationContext } from '../handler.js';
import type { CascadePreview } from '../types.js';
import { resourceName, resourceNameToString } from '../../utils/resource-utils.js';
import {
  rewriteCalculationRefs,
  rewriteCardContentRefs,
  rewriteHandlebarRefs,
} from '../cascades/rewrite-refs.js';

/**
 * Rename a template. Cascade: rewrite references in card index.adoc
 * files (createCards macro), reports, and calculations.
 *
 * The handler owns the cascade explicitly: it rewrites references in
 * calculations, handlebar files and card content before delegating the
 * actual rename to TemplateResource. TemplateResource.onNameChange no
 * longer fires the cascade; it only persists metadata after rename.
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

    // Rewrite cascading references BEFORE renaming the resource on disk.
    // Order matters: cascade scanners look for the old name, and the
    // resource file (with that name) must still exist when they run.
    // TODO: compute accurate counts now that cascade is explicit
    await rewriteCalculationRefs(ctx.project, oldName, newName);
    await rewriteHandlebarRefs(ctx.project, oldName, newName);
    await rewriteCardContentRefs(ctx.project, oldName, newName);

    await resource.rename(resourceName(newName));
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
    // Flush the project-level cards cache before the resource is deleted.
    // After resource.delete() runs, resourceNameToString(this.resourceName)
    // inside the resource would no longer match a live template, so the
    // cache flush has to happen here while the name is still meaningful.
    ctx.project.cardsCache.deleteCardsFromTemplate(name);
    await resource.delete();
  }

  async affectedFilePaths(): Promise<string[]> {
    return [];
  }
}
