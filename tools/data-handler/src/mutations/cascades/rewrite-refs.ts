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

import { ResourcesFrom } from '../../containers/project/resources-from.js';
import { filename } from '../../interfaces/folder-content-interfaces.js';

import type { Project } from '../../containers/project.js';

/**
 * Update the content files of every local folder resource (calculations,
 * graph models, graph views, reports): replace all occurrences of `from`
 * with `to`. Goes through each resource's own content-file interface
 * (`contentData`/`updateFile`) so the in-memory state stays in sync with
 * disk. Non-string content (e.g. a report's parameter schema) is skipped.
 * @param project Project whose folder resources should be rewritten
 * @param from Resource name to update
 * @param to New name for resource
 * @throws if 'from' or 'to' is empty string
 */
export async function rewriteContentFileRefs(
  project: Project,
  from: string,
  to: string,
) {
  if (!from.trim() || !to.trim()) {
    throw new Error(
      'rewriteContentFileRefs: "from" and "to" parameters must not be empty',
    );
  }

  // Local folder resources only: module content is migrated by the owning module.
  const resources = [
    ...project.resources.calculations(ResourcesFrom.localOnly),
    ...project.resources.graphModels(ResourcesFrom.localOnly),
    ...project.resources.graphViews(ResourcesFrom.localOnly),
    ...project.resources.reports(ResourcesFrom.localOnly),
  ];

  await Promise.all(
    resources.map(async (resource) => {
      const content = resource.contentData() as Record<string, unknown>;
      for (const [key, value] of Object.entries(content)) {
        if (typeof value === 'string' && value.includes(from)) {
          await resource.updateFile(filename(key)!, value.replaceAll(from, to));
        }
      }
    }),
  );
}

/**
 * Update references in card content.
 * Searches through all card content in the cache and replaces references to the old resource name.
 * @param project Project whose card content should be rewritten
 * @param from Resource name to update
 * @param to New name for resource
 * @throws if 'from' or 'to' is empty string
 */
export async function rewriteCardContentRefs(
  project: Project,
  from: string,
  to: string,
) {
  if (!from.trim() || !to.trim()) {
    throw new Error(
      'rewriteCardContentRefs: "from" and "to" parameters must not be empty',
    );
  }

  // Local templates only: module content is migrated by the owning module.
  const localTemplateCards = project.resources
    .templates(ResourcesFrom.localOnly)
    .flatMap((template) => template.templateObject().cards());
  const allCards = [...project.cards(undefined), ...localTemplateCards];
  const cardsToUpdate = allCards.filter(
    (card) => card.content && card.content.includes(from),
  );

  if (cardsToUpdate.length === 0) {
    return;
  }

  await Promise.all(
    cardsToUpdate.map(async (card) => {
      if (card.content) {
        const updatedContent = card.content.replaceAll(from, to);
        await project.updateCardContent(card.key, updatedContent);
      }
    }),
  );
}
