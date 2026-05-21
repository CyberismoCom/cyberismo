// tools/data-handler/src/mutations/handlers/project-rename.ts

import { join } from 'node:path';
import {
  rename as renameFile,
  readdir,
  readFile,
  writeFile,
} from 'node:fs/promises';

import type { Handler, MutationContext } from '../handler.js';
import type { CascadePreview } from '../types.js';
import { isTemplateCard } from '../../utils/card-utils.js';
import { resourceName } from '../../utils/resource-utils.js';
import { ResourcesFrom } from '../../containers/project/resources-from.js';
import type { Card } from '../../interfaces/project-interfaces.js';

const FILE_TYPES_WITH_PREFIX_REFERENCES = ['adoc', 'hbs', 'json', 'lp'];

/**
 * Rewrites every `<oldPrefix>/<resourceType>/...` reference and every
 * `<oldPrefix>_*` card key across the project. The largest cascade in
 * the system; ported from commands/rename.ts:Rename.rename(to).
 */
export class ProjectRenameHandler implements Handler {
  readonly isBreaking = true;

  matches(ctx: MutationContext): boolean {
    return ctx.input.kind === 'project_rename';
  }

  async preview(ctx: MutationContext): Promise<CascadePreview> {
    if (ctx.input.kind !== 'project_rename') {
      throw new Error('ProjectRenameHandler: non-project_rename input');
    }
    const oldPrefix = ctx.project.projectPrefix;
    const cards = ctx.project.cards(undefined);
    const resourceCount =
      ctx.project.resources.cardTypes(ResourcesFrom.localOnly).length +
      ctx.project.resources.workflows(ResourcesFrom.localOnly).length +
      ctx.project.resources.fieldTypes(ResourcesFrom.localOnly).length +
      ctx.project.resources.linkTypes(ResourcesFrom.localOnly).length +
      ctx.project.resources.templates(ResourcesFrom.localOnly).length +
      ctx.project.resources.calculations(ResourcesFrom.localOnly).length +
      ctx.project.resources.reports(ResourcesFrom.localOnly).length +
      ctx.project.resources.graphModels(ResourcesFrom.localOnly).length +
      ctx.project.resources.graphViews(ResourcesFrom.localOnly).length;

    return {
      affectedCardCount: cards.length,
      affectedLinkCount: 0,
      affectedCalculationCount: ctx.project.resources.calculations(
        ResourcesFrom.localOnly,
      ).length,
      affectedHandlebarFileCount: 0,
      dataLossExpected: false,
      summary: `Renames project prefix '${oldPrefix}'. Rewrites every '${oldPrefix}/...' reference and every '${oldPrefix}_*' card key. Touches ${cards.length} cards and ${resourceCount} local resources.`,
    };
  }

  async apply(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'project_rename') {
      throw new Error('ProjectRenameHandler: non-project_rename input');
    }
    const from = ctx.project.projectPrefix;
    const to = ctx.input.newPrefix;
    if (!to) {
      throw new Error("Input validation error: empty 'to' is not allowed");
    }
    if (from === to) {
      throw new Error(`Project prefix is already '${from}'`);
    }

    // (1) Change project prefix and invalidate caches.
    await ctx.project.configuration.setCardPrefix(to);
    ctx.project.resources.changed();

    // (2) Rename every local resource by category, in dependency order.
    const orderedCategories = [
      'cardTypes',
      'workflows',
      'fieldTypes',
      'graphModels',
      'graphViews',
      'linkTypes',
      'reports',
      'templates',
      'calculations',
    ] as const;

    for (const category of orderedCategories) {
      for (const resource of ctx.project.resources.resourceTypes(
        category,
        ResourcesFrom.localOnly,
      )) {
        const oldName = resource.data?.name ?? '';
        if (!oldName) continue;
        const parsed = resourceName(oldName);
        if (parsed.prefix !== from) continue;
        const newName = `${to}/${parsed.type}/${parsed.identifier}`;
        await resource.rename(resourceName(newName));
      }
    }

    // (3) Rename template cards (deepest first) and rewrite their content/attachments.
    for (const template of ctx.project.resources.templates(
      ResourcesFrom.localOnly,
    )) {
      await renameCards(ctx, template.templateObject().cards(), from, to);
    }

    // (4) Rename project cards.
    await renameCards(
      ctx,
      ctx.project.cards(ctx.project.paths.cardRootFolder),
      from,
      to,
    );

    // (5) Walk cardRoot and resources, rewriting every prefix-qualified
    //     reference and every "<prefix>_" card-key prefix.
    await updateFiles(ctx.project.paths.cardRootFolder, from, to);
    await updateFiles(ctx.project.paths.resourcesFolder, from, to);

    // (6) Re-collect resources and rebuild card caches.
    ctx.project.resources.changed();
    ctx.project.cardsCache.clear();
    await ctx.project.populateCaches();
  }

  async affectedFilePaths(ctx: MutationContext): Promise<string[]> {
    if (ctx.input.kind !== 'project_rename') return [];
    const paths: string[] = [];
    for (const card of ctx.project.cards(undefined)) {
      paths.push(join(card.path, 'index.json'));
    }
    for (const card of ctx.project.allTemplateCards()) {
      paths.push(join(card.path, 'index.json'));
    }
    return paths;
  }
}

// ---- Helpers extracted from commands/rename.ts (private) ----

async function renameCards(
  ctx: MutationContext,
  cards: Card[],
  from: string,
  to: string,
): Promise<void> {
  // Sort cards by path length (deepest first) so children rename before parents.
  const sortedCards = [...cards].sort((a, b) => b.path.length - a.path.length);

  // Use negative lookahead so only the last occurrence in the path is replaced;
  // matches the existing rename logic in commands/rename.ts.
  const re = new RegExp(`${from}(?!.*${from})`);

  for (const card of sortedCards) {
    card.content = await updateCardAttachments(re, card, to);
    await renameOneCard(ctx, re, card, from, to);
  }
}

async function updateCardAttachments(
  re: RegExp,
  card: Card,
  to: string,
): Promise<string | undefined> {
  if (!isTemplateCard(card)) {
    const attachments = card.attachments ?? [];
    await Promise.all(
      attachments.map(async (attachment) => {
        const newAttachmentFileName = attachment.fileName.replace(re, to);
        await renameFile(
          join(attachment.path, attachment.fileName),
          join(attachment.path, newAttachmentFileName),
        );
      }),
    );
  }
  return card.content;
}

async function renameOneCard(
  ctx: MutationContext,
  re: RegExp,
  card: Card,
  from: string,
  to: string,
): Promise<void> {
  await updateCardMetadata(ctx, card, from, to);
  const newCardPath = card.path.replace(re, to);
  await renameFile(card.path, newCardPath);
}

async function updateCardMetadata(
  ctx: MutationContext,
  card: Card,
  from: string,
  to: string,
): Promise<void> {
  if (card.metadata?.cardType && card.metadata.cardType.length > 0) {
    const { identifier, prefix, type } = resourceName(card.metadata.cardType);
    if (prefix === from) {
      card.metadata.cardType = `${to}/${type}/${identifier}`;
      const keys = Object.keys(card.metadata);
      for (const oldKey of keys) {
        if (oldKey.startsWith(`${from}/fieldTypes`)) {
          const parsed = resourceName(oldKey);
          const newKey = `${to}/${parsed.type}/${parsed.identifier}`;
          delete Object.assign(card.metadata, {
            [newKey]: card.metadata[oldKey],
          })[oldKey];
        }
      }
      await ctx.project.updateCardMetadata(card, card.metadata);
    }
  }
}

function scanExtensions(fileName: string): boolean {
  if (!fileName || !fileName.includes('.') || fileName.at(0) === '.') {
    return false;
  }
  const extension = fileName.split('.').pop() ?? '';
  return FILE_TYPES_WITH_PREFIX_REFERENCES.includes(extension);
}

async function updateFiles(
  location: string,
  from: string,
  to: string,
): Promise<void> {
  const conversionMap = new Map([
    [`${from}/calculations/`, `${to}/calculations/`],
    [`${from}/cardTypes/`, `${to}/cardTypes/`],
    [`${from}/fieldTypes/`, `${to}/fieldTypes/`],
    [`${from}/linkTypes/`, `${to}/linkTypes/`],
    [`${from}/reports/`, `${to}/reports/`],
    [`${from}/templates/`, `${to}/templates/`],
    [`${from}/workflows/`, `${to}/workflows/`],
    [`${from}_`, `${to}_`],
  ]);

  const files = (
    await readdir(location, { recursive: true, withFileTypes: true })
  ).filter(
    (item) =>
      item.isFile() && item.name !== '.schema' && scanExtensions(item.name),
  );

  await Promise.all(
    files.map(async (item) => {
      const target = join(item.parentPath, item.name);
      let fileContent = await readFile(target, { encoding: 'utf-8' });
      for (const [key, value] of conversionMap) {
        const re = new RegExp(`(?<![a-z])${key}`, 'g');
        fileContent = fileContent.replace(re, value);
      }
      await writeFile(target, fileContent);
    }),
  );
}
