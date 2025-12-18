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

import { resourceName } from '../utils/resource-utils.js';
import { ResourceObject } from './resource-object.js';
import { ResourcesFrom } from '../containers/project.js';

import type {
  Card,
  ResourceFolderType,
} from '../interfaces/project-interfaces.js';
import type { Project } from '../containers/project.js';
import type { ResourceBaseMetadata } from '../interfaces/resource-interfaces.js';
import type { ResourceName } from '../utils/resource-utils.js';
import type { Operation, ShowReturnType } from './resource-object.js';
import type { UpdateKey } from '../interfaces/resource-interfaces.js';

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
  /**
   * Collects cards that match the given filter function.
   * @param resourceName The resource name to filter by
   * @param filterFn Function that returns true for cards to include
   * @returns Array of cards that match the filter
   */
  protected async collectCards(
    resourceName: string,
    filterFn: (card: Card, resourceName: string) => boolean,
  ): Promise<Card[]> {
    function filteredCards(
      cardSource: Card[],
      resourceName: string,
      filterFn: (card: Card, resourceName: string) => boolean,
    ): Card[] {
      return cardSource.filter((card) => filterFn(card, resourceName));
    }

    // Collect both project cards ...
    const projectCards = filteredCards(
      this.project.cards(this.project.paths.cardRootFolder),
      resourceName,
      filterFn,
    );
    // ... and cards from each template that would be affected.
    const templates = this.project.resources.templates(ResourcesFrom.localOnly);
    const templateCards = templates.map((template) => {
      const templateObject = template.templateObject();
      return filteredCards(templateObject.cards(), resourceName, filterFn);
    });
    // Return all affected cards
    const cards = [projectCards, ...templateCards].reduce(
      (accumulator, value) => accumulator.concat(value),
      [],
    );
    return cards;
  }

  /**
   * For handling name changes.
   * @param previousName The previous name before the change
   */
  protected abstract onNameChange?(previousName: string): Promise<void>;

  /**
   * Updates resource key to a new prefix
   * @param name Resource name
   * @param prefixes list of prefixes in the project
   * @returns updated resource name
   */
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
   * Updates resource.
   * @param updateKey Key to modify
   * @param op Operation to perform on 'key'
   * @throws if key is unknown.
   */
  public async update<Type, K extends string>(
    updateKey: UpdateKey<K>,
    op: Operation<Type>,
  ) {
    const { key } = updateKey;

    const nameChange = key === 'name';
    const existingName = this.content.name;
    await super.update(updateKey, op);
    const content = structuredClone(this.content);

    if (key === 'name') {
      content.name = super.handleScalar(op) as string;
    } else if (key === 'displayName') {
      content.displayName = super.handleScalar(op) as string;
    } else if (key === 'description') {
      content.description = super.handleScalar(op) as string;
    } else {
      throw new Error(`Unknown property '${key}' for folder resource`);
    }

    await super.postUpdate(content, updateKey, op);

    if (nameChange) {
      await this.onNameChange?.(existingName);
    }
  }

  /**
   * Returns the resource metadata content.
   * @returns metadata content
   */
  public show(): ShowReturnType<T> {
    this.assertResourceExists();
    return this.content;
  }
}
