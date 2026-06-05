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
 *
 * This is the largest cascade in the system. It was previously owned by
 * `commands/rename.ts:Rename.rename(to)`; that command is now a thin wrapper
 * that routes through `ResourceMutations.apply({ kind: 'project_rename' })`,
 * so this handler is the single owner of the cascade. The whole operation
 * runs inside `apply`; there is no module-target / local-target split because
 * a project rename only ever touches the local project.
 *
 * `isBreaking` is true: a prefix change rewrites resource names and card keys
 * across the project, so `ResourceMutations` records a `project_rename`
 * ConfigurationLogger entry afterwards. The handler itself does NOT log — the
 * old `Rename` command's `ConfigurationLogger.log` call has been removed so
 * the entry is written exactly once, by the engine.
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
    const from = ctx.project.projectPrefix;
    const to = ctx.input.newPrefix;
    if (!to) {
      throw new Error("Input validation error: empty 'to' is not allowed");
    }
    if (from === to) {
      throw new Error(`Project prefix is already '${from}'`);
    }

    // (1) Change project prefix and invalidate caches. setCardPrefix validates
    //     the new prefix format and throws for invalid prefixes.
    await ctx.project.configuration.setCardPrefix(to);
    ctx.project.resources.changed();

    // (2) Rename every local resource by category, in dependency order
    //     (card types, workflows, field types first; then the rest).
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
        // Do not rename module resources.
        if (parsed.prefix !== from) continue;
        const newName = `${to}/${parsed.type}/${parsed.identifier}`;
        await resource.rename(resourceName(newName));
      }
    }

    // (3) Rename template cards (deepest first) and rewrite their
    //     content/attachments. Must run after calculations are renamed.
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
}

// ---- Helpers extracted from commands/rename.ts (formerly private methods) ----

async function renameCards(
  ctx: MutationContext,
  cards: Card[],
  from: string,
  to: string,
): Promise<void> {
  // Sort cards by path length (deepest first) so children rename before parents.
  const sortedCards = [...cards].sort((a, b) => b.path.length - a.path.length);

  // Negative lookahead so only the last occurrence in the path is replaced;
  // the path may contain project prefixes that must not be touched. Matches
  // the original rename logic in commands/rename.ts.
  const re = new RegExp(`${from}(?!.*${from})`);

  // Cannot run in parallel: deeper cards must be renamed before their parents.
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
      // Update the card's custom field keys.
      const keys = Object.keys(card.metadata);
      for (const oldKey of keys) {
        if (oldKey.startsWith(`${from}/fieldTypes`)) {
          const parsed = resourceName(oldKey);
          const newKey = `${to}/${parsed.type}/${parsed.identifier}`;
          // One-liner to remove the old key and add the new one.
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
  // A file with no dot (or a dotfile) cannot carry a relevant extension.
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
