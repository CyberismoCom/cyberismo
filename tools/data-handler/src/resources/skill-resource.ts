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

import { copyDir } from '../utils/file-utils.js';
import { DefaultContent } from './create-defaults.js';
import { FolderResource } from './folder-resource.js';
import { getStaticDirectoryPath } from '@cyberismo/assets';
import { resourceNameToString } from '../utils/resource-utils.js';
import { sortCards } from '../utils/card-utils.js';

import type { Card } from '../interfaces/project-interfaces.js';
import type { Project } from '../containers/project.js';
import type { SkillContent } from '../interfaces/folder-content-interfaces.js';
import type { SkillMetadata } from '../interfaces/resource-interfaces.js';
import type { ResourceName } from '../utils/resource-utils.js';

/**
 * Skill resource class.
 */
export class SkillResource extends FolderResource<SkillMetadata, SkillContent> {
  /**
   * Creates instance of SkillResource
   * @param project Project to use
   * @param name Resource name
   */
  constructor(project: Project, name: ResourceName) {
    super(project, name, 'skills');

    this.contentSchemaId = 'skillSchema';
    this.contentSchema = super.contentSchemaContent(this.contentSchemaId);
  }

  // Path to content folder.
  private async getDefaultSkillLocation(): Promise<string> {
    const staticDirectoryPath = await getStaticDirectoryPath();
    return join(staticDirectoryPath, 'defaultSkill');
  }

  /**
   * Sets new metadata into the skill object.
   */
  public async createSkill() {
    const defaultContent = DefaultContent.skill(
      resourceNameToString(this.resourceName),
    );

    await super.create(defaultContent);

    // Copy skill default structure to destination.
    const defaultSkillLocation = await this.getDefaultSkillLocation();
    await copyDir(defaultSkillLocation, this.internalFolder);
    await this.loadContentFiles();
  }

  /**
   * List where this resource is used.
   * Always returns card key references first, then calculation references.
   *
   * @param cards Optional. Check these cards for usage of this resource. If undefined, will check all cards.
   * @returns array of card keys and calculation filenames that refer this resource.
   */
  public async usage(cards?: Card[]): Promise<string[]> {
    const allCards = cards ?? super.cards();
    const [relevantCards, calculations] = await Promise.all([
      super.usage(allCards),
      super.calculations(),
    ]);
    return [...relevantCards.sort(sortCards), ...calculations];
  }
}
