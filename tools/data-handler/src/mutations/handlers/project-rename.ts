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

import { join } from 'node:path';
import {
  rename as renameFile,
  readdir,
  readFile,
  writeFile,
} from 'node:fs/promises';

import type { Handler, MutationContext } from '../handler.js';
import type { Card } from '../../interfaces/project-interfaces.js';
import { isTemplateCard } from '../../utils/card-utils.js';
import { resourceName } from '../../utils/resource-utils.js';
import { ResourcesFrom } from '../../containers/project/resources-from.js';

const FILE_TYPES_WITH_PREFIX_REFERENCES = ['adoc', 'hbs', 'json', 'lp'];

/**
 * Renames a project's card-key prefix and the entire cascade that depends on
 * it: every local resource name, every `<oldPrefix>/<resourceType>/...`
 * reference, every `<oldPrefix>_*` card key, card metadata, attachments, and
 * file contents (adoc/hbs/json/lp).
 */
export class ProjectRenameHandler implements Handler {
  readonly isBreaking = true;

  matches(ctx: MutationContext): boolean {
    return ctx.input.kind === 'project_rename';
  }

  async apply(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'project_rename') {
      throw new Error(
        'ProjectRenameHandler called with non-project_rename input',
      );
    }
    // Capture before setCardPrefix changes projectPrefix.
    const from = ctx.project.projectPrefix;
    const to = ctx.input.newPrefix;
    if (!to) {
      throw new Error("Input validation error: empty 'to' is not allowed");
    }
    if (from === to) {
      throw new Error(`Project prefix is already '${from}'`);
    }

    // The prefix must change first: resource renames are validated against the
    // current projectPrefix. The cache refresh is also required — local
    // registry keys are derived from projectPrefix at collection time.
    await ctx.project.configuration.setCardPrefix(to);
    ctx.project.resources.changed();

    // Referenced resource families must rename before their referrers.
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
        // The file's own name field not carrying the old prefix means the
        // resource was already renamed (e.g. a partially completed run).
        if (parsed.prefix !== from) continue;
        await resource.changePrefix(to);
      }
    }

    // Card renames must run after the resource renames above.
    for (const template of ctx.project.resources.templates(
      ResourcesFrom.localOnly,
    )) {
      await renameCards(ctx, template.templateObject().cards(), from, to);
    }
    await renameCards(
      ctx,
      ctx.project.cards(ctx.project.paths.cardRootFolder),
      from,
      to,
    );

    await this.cascade(ctx, from, to);

    ctx.project.resources.changed();
    ctx.project.cardsCache.clear();
    await ctx.project.populateCaches();
  }

  /**
   * Rewrite local references from `<from>/…` resource names and `<from>_`
   * card keys to the new prefix. Local apply: card metadata was already
   * rewritten by renameCards, so the metadata pass no-ops. Foreign replay
   * (module renamed its prefix): `oldPrefix` is REQUIRED and comes from the
   * recorded log entry, and this pass IS the metadata/content rewrite.
   */
  async applyCascade(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'project_rename') {
      throw new Error(
        'ProjectRenameHandler called with non-project_rename input',
      );
    }
    const from = ctx.input.oldPrefix;
    if (!from) {
      throw new Error('project_rename cascade requires oldPrefix');
    }
    await this.cascade(ctx, from, ctx.input.newPrefix);
  }

  private async cascade(
    ctx: MutationContext,
    from: string,
    to: string,
  ): Promise<void> {
    const localCards = [
      ...ctx.project.cards(ctx.project.paths.cardRootFolder),
      ...ctx.project.resources
        .templates(ResourcesFrom.localOnly)
        .flatMap((t) => t.templateObject().cards()),
    ];
    for (const card of localCards) {
      await updateCardMetadata(ctx, card, from, to);
    }

    await updateFiles(ctx.project.paths.cardRootFolder, from, to);
    await updateFiles(ctx.project.paths.resourcesFolder, from, to);
  }
}

async function renameCards(
  ctx: MutationContext,
  cards: Card[],
  from: string,
  to: string,
): Promise<void> {
  // Children must be renamed before their parents, so deepest paths first
  // and strictly sequentially.
  const sortedCards = [...cards].sort((a, b) => b.path.length - a.path.length);

  // Negative lookahead so only the last occurrence in the path is replaced;
  // the path may contain project prefixes that must not be touched.
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
        // NOTE: file contents are rewritten by updateFiles.
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
      for (const oldKey of Object.keys(card.metadata)) {
        if (oldKey.startsWith(`${from}/fieldTypes`)) {
          const parsed = resourceName(oldKey);
          const newKey = `${to}/${parsed.type}/${parsed.identifier}`;
          card.metadata[newKey] = card.metadata[oldKey];
          delete card.metadata[oldKey];
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
    [`${from}/graphModels/`, `${to}/graphModels/`],
    [`${from}/graphViews/`, `${to}/graphViews/`],
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
        // Negative lookbehind prevents matching inside a longer prefix
        // (e.g. renaming "test" to "projtest" must not re-match the "test/"
        // substring inside the already-renamed "projtest/").
        const re = new RegExp(`(?<![a-z])${key}`, 'g');
        fileContent = fileContent.replace(re, value);
      }
      await writeFile(target, fileContent);
    }),
  );
}
