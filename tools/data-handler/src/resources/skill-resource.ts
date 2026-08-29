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
import type { Operation } from './resource-object.js';
import type { Project } from '../containers/project.js';
import type { SkillContent } from '../interfaces/folder-content-interfaces.js';
import type { SkillMetadata } from '../interfaces/resource-interfaces.js';
import type { ResourceName } from '../utils/resource-utils.js';
import type { UpdateKey } from '../interfaces/resource-interfaces.js';

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
   * Handles the skill specific 'relatedTools' property.
   * @param content Content to modify in place.
   * @param updateKey Key to modify.
   * @param op Operation to perform on 'key'.
   * @returns true if the key was handled, false if it is unknown.
   */
  protected updateAdditionalProperty<Type, K extends string>(
    content: SkillMetadata,
    updateKey: UpdateKey<K>,
    op: Operation<Type>,
  ): boolean {
    if (updateKey.key !== 'relatedTools') {
      return false;
    }
    content.relatedTools = super.handleArray(
      op,
      updateKey.key,
      content.relatedTools as Type[],
    ) as string[];
    return true;
  }

  /**
   * List where this resource is used.
   * Always returns card key references first, then calculation references.
   *
   * @param cards Optional. Check these cards for usage of this resource. If undefined, will check all cards.
   * @returns array of card keys and calculation filenames that refer this resource.
   */
  public async usage(cards?: Card[]): Promise<string[]> {
    const allCards = cards ?? (await super.cards());
    const [relevantCards, calculations] = await Promise.all([
      super.usage(allCards),
      super.calculations(),
    ]);
    return [...relevantCards.sort(sortCards), ...calculations];
  }
}
