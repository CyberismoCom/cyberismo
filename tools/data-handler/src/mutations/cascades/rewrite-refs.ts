/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { readFile, writeFile } from 'node:fs/promises';

import { ResourcesFrom } from '../../containers/project/resources-from.js';

import type { Project } from '../../containers/project.js';

/**
 * Default list of handlebar files for a project.
 * Mirrors ResourceObject.reportHandlerBarFiles(ResourcesFrom.localOnly).
 */
async function defaultHandlebarFiles(project: Project): Promise<string[]> {
  const files = await Promise.all(
    project.resources
      .reports(ResourcesFrom.localOnly)
      .map((r) => r.handleBarFiles()),
  );
  return files.flat();
}

/**
 * Update calculation files: replace all occurrences of `from` with `to`
 * in local calculation resources.
 * @param project Project whose calculations should be rewritten
 * @param from Resource name to update
 * @param to New name for resource
 * @throws if 'from' or 'to' is empty string
 */
export async function rewriteCalculationRefs(
  project: Project,
  from: string,
  to: string,
) {
  if (!from.trim() || !to.trim()) {
    throw new Error(
      'updateCalculations: "from" and "to" parameters must not be empty',
    );
  }

  const calculations = project.resources.calculations(ResourcesFrom.localOnly);

  await Promise.all(
    calculations.map(async (calculation) => {
      const content = calculation.contentData();
      if (content.calculation) {
        const updatedContent = content.calculation.replaceAll(from, to);
        await calculation.updateFile('calculation.lp', updatedContent);
      }
    }),
  );
}

/**
 * Update references in handlebar files.
 * @param project Project whose handlebar files should be rewritten
 * @param from Resource name to update
 * @param to New name for resource
 * @param handleBarFiles Optional. List of handlebar files. If omitted, affects all handlebar files in the project.
 * @throws if 'from' or 'to' is empty string
 */
export async function rewriteHandlebarRefs(
  project: Project,
  from: string,
  to: string,
  handleBarFiles?: string[],
) {
  if (!from.trim() || !to.trim()) {
    throw new Error(
      'updateHandleBars: "from" and "to" parameters must not be empty',
    );
  }

  if (!handleBarFiles) {
    handleBarFiles = await defaultHandlebarFiles(project);
  }

  // Process all files in parallel.
  await Promise.all(
    handleBarFiles.map(async (handleBarFile) => {
      const content = await readFile(handleBarFile);
      const updatedContent = content.toString().replaceAll(from, to);
      await writeFile(handleBarFile, Buffer.from(updatedContent));
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
      'updateCardContentReferences: "from" and "to" parameters must not be empty',
    );
  }

  const allCards = [
    ...project.cards(undefined),
    ...project.allTemplateCards(),
  ];
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
