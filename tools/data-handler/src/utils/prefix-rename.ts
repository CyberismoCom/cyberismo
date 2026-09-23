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

import type { Project } from '../containers/project.js';
import type { Card } from '../interfaces/project-interfaces.js';
import { resourceName } from './resource-utils.js';
import { ResourcesFrom } from '../containers/project/resources-from.js';

const FILE_TYPES_WITH_PREFIX_REFERENCES = ['adoc', 'hbs', 'json', 'lp'];

/**
 * Renames a project's card-key prefix and the entire cascade that depends on
 * it: every local resource name, every `<oldPrefix>/<resourceType>/...`
 * reference, every `<oldPrefix>_*` card key, card metadata, attachments, and
 * file contents (adoc/hbs/json/lp).
 *
 * A prefix is a project's identity, so this never runs on behalf of a module
 * the project consumes: it only ever rewrites the project's own content.
 */
export async function renameProjectPrefix(
  project: Project,
  to: string,
): Promise<void> {
  // Capture before setCardPrefix changes projectPrefix.
  const from = project.projectPrefix;
  if (!to) {
    throw new Error("Input validation error: empty 'to' is not allowed");
  }
  if (from === to) {
    throw new Error(`Project prefix is already '${from}'`);
  }

  // The prefix must change first: resource renames are validated against the
  // current projectPrefix. The cache refresh is also required — local
  // registry keys are derived from projectPrefix at collection time.
  await project.configuration.setCardPrefix(to);
  project.resources.changed();

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
    for (const resource of project.resources.resourceTypes(
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
  for (const template of project.resources.templates(ResourcesFrom.localOnly)) {
    await renameCards(project, template.cardTree.cards(), from, to);
  }
  await renameCards(project, project.cardTree.cards(), from, to);

  // References that renameCards did not reach: card metadata already
  // rewritten above no-ops here, file contents do not.
  const localCards = [
    ...project.cardTree.cards(),
    ...project.resources
      .templates(ResourcesFrom.localOnly)
      .flatMap((t) => t.cardTree.cards()),
  ];
  for (const card of localCards) {
    await updateCardMetadata(project, card, from, to);
  }
  await updateFiles(project.paths.cardRootFolder, from, to);
  await updateFiles(project.paths.resourcesFolder, from, to);

  project.resources.changed();
  project.clearCards();
  await project.populateCaches();
}

async function renameCards(
  project: Project,
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
    card.content = await updateCardAttachments(project, re, card, to);
    await renameOneCard(project, re, card, from, to);
  }
}

async function updateCardAttachments(
  project: Project,
  re: RegExp,
  card: Card,
  to: string,
): Promise<string | undefined> {
  if (project.treeOf(card.key).kind === 'project') {
    const fileNames = (card.attachments ?? []).map((item) => item.fileName);
    await Promise.all(
      fileNames.map(async (fileName) => {
        // NOTE: file contents are rewritten by updateFiles.
        await project.renameCardAttachment(
          card.key,
          fileName,
          fileName.replace(re, to),
        );
      }),
    );
  }
  return card.content;
}

async function renameOneCard(
  project: Project,
  re: RegExp,
  card: Card,
  from: string,
  to: string,
): Promise<void> {
  await updateCardMetadata(project, card, from, to);
  const newCardPath = card.path.replace(re, to);
  await renameFile(card.path, newCardPath);
}

async function updateCardMetadata(
  project: Project,
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
      await project.updateCardMetadata(card, card.metadata);
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
