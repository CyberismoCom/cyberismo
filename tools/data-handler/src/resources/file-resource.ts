/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2024
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import type {
  Card,
  ResourceFolderType,
} from '../interfaces/project-interfaces.js';
import type { ShowReturnType } from './resource-object.js';
import {
  type AddOperation,
  type ChangeOperation,
  type Operation,
  type RemoveOperation,
  ResourceObject,
} from './resource-object.js';
import { DefaultContent } from './create-defaults.js';
import { Project, ResourcesFrom } from '../containers/project.js';
import type { ResourceBaseMetadata } from '../interfaces/resource-interfaces.js';
import {
  type ResourceName,
  resourceName,
  resourceNameToString,
} from '../utils/resource-utils.js';
import { sortCards } from '../utils/card-utils.js';
import { Template } from '../containers/template.js';

export {
  type AddOperation,
  type Card,
  type ChangeOperation,
  DefaultContent,
  type Operation,
  Project,
  RemoveOperation,
  ResourcesFrom,
  resourceName,
  type ResourceName,
  resourceNameToString,
  sortCards,
};

/**
 * Base class for file based resources (card types, field types, link types, workflows, ...)
 */
export abstract class FileResource<
  T extends ResourceBaseMetadata,
> extends ResourceObject<T, never> {
  constructor(project: Project, name: ResourceName, type: ResourceFolderType) {
    super(project, name, type);
    this.initialize();
  }
  // Collects cards that are using the 'cardTypeName'.
  protected async collectCards(cardTypeName: string) {
    function filteredCards(cardSource: Card[], cardTypeName: string): Card[] {
      const cards = cardSource;
      return cards.filter((card) => card.metadata?.cardType === cardTypeName);
    }

    // Collect both project cards ...
    const projectCards = filteredCards(
      this.project.cards(this.project.paths.cardRootFolder),
      cardTypeName,
    );
    // ... and cards from each template that would be affected.
    const templates = await this.project.templates(ResourcesFrom.localOnly);
    const templateCards = templates.map((template) => {
      const templateObject = new Template(this.project, template);
      return filteredCards(templateObject.cards(), cardTypeName);
    });
    // Return all affected cards
    const cards = [projectCards, ...templateCards].reduce(
      (accumulator, value) => accumulator.concat(value),
      [],
    );
    return cards;
  }
  // Updates resource key to a new prefix
  protected updatePrefixInResourceName(name: string, prefixes: string[]) {
    const { identifier, prefix, type } = resourceName(name);
    if (this.moduleResource) {
      return name;
    }
    return !prefixes.includes(prefix)
      ? `${this.project.configuration.cardKeyPrefix}/${type}/${identifier}`
      : name;
  }

  /**
   * Returns the resource metadata content.
   * @returns metadata content
   * @throws if resource does not exist.
   */
  public async show(): Promise<ShowReturnType<T>> {
    this.assertResourceExists();
    return this.content;
  }
}
