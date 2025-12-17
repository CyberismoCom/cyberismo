/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { DefaultContent } from './create-defaults.js';
import { FileResource } from './file-resource.js';
import { resourceNameToString } from '../utils/resource-utils.js';
import { sortCards } from '../utils/card-utils.js';

import type { Card } from '../interfaces/project-interfaces.js';
import type { LinkType, UpdateKey } from '../interfaces/resource-interfaces.js';
import type { Operation } from './resource-object.js';
import type { Project } from '../containers/project.js';
import type { ResourceName } from '../utils/resource-utils.js';

/**
 * Link Type resource class.
 */
export class LinkTypeResource extends FileResource<LinkType> {
  constructor(project: Project, name: ResourceName) {
    super(project, name, 'linkTypes');

    this.contentSchemaId = 'linkTypeSchema';
    this.contentSchema = super.contentSchemaContent(this.contentSchemaId);
  }

  /**
   * When resource name changes.
   * @param existingName Current resource name.
   */
  protected async onNameChange(existingName: string) {
    const current = this.content;
    const prefixes = this.project.projectPrefixes();
    if (current.sourceCardTypes) {
      current.sourceCardTypes = current.sourceCardTypes.map((item) =>
        this.updatePrefixInResourceName(item, prefixes),
      );
    }
    if (current.destinationCardTypes) {
      current.destinationCardTypes = current.destinationCardTypes.map((item) =>
        this.updatePrefixInResourceName(item, prefixes),
      );
    }
    await Promise.all([
      super.updateHandleBars(existingName, this.content.name),
      super.updateCalculations(existingName, this.content.name),
    ]);
    // Finally, write updated content.
    await this.write();
  }

  /**
   * Creates a new link type object. Base class writes the object to disk automatically.
   * @param newContent Content for the link type.
   */
  public async create(newContent?: LinkType) {
    if (!newContent) {
      newContent = DefaultContent.linkType(
        resourceNameToString(this.resourceName),
      );
    } else {
      await this.validate(newContent);
    }
    return super.create(newContent);
  }

  /**
   * Renames resource metadata file and renames memory resident object 'name'.
   * @param newName New name for the resource.
   */
  public async rename(newName: ResourceName) {
    const existingName = this.content.name;
    await super.rename(newName);
    return this.onNameChange(existingName);
  }

  /**
   * Updates link type resource.
   * @param updateKey Key to modify
   * @param op Operation to perform on 'key'
   */
  public async update<Type, K extends string>(
    updateKey: UpdateKey<K>,
    op: Operation<Type>,
  ) {
    const { key } = updateKey;

    if (key === 'name' || key === 'displayName' || key === 'description') {
      await super.update(updateKey, op);
    } else {
      const content = structuredClone(this.content);
      if (key === 'destinationCardTypes') {
        content.destinationCardTypes = super.handleArray(
          op,
          key,
          content.destinationCardTypes as Type[],
        ) as string[];
      } else if (key === 'enableLinkDescription') {
        content.enableLinkDescription = super.handleScalar(op) as boolean;
      } else if (key === 'inboundDisplayName') {
        content.inboundDisplayName = super.handleScalar(op) as string;
      } else if (key === 'outboundDisplayName') {
        content.outboundDisplayName = super.handleScalar(op) as string;
      } else if (key === 'sourceCardTypes') {
        content.sourceCardTypes = super.handleArray(
          op,
          key,
          content.sourceCardTypes as Type[],
        ) as string[];
      } else {
        throw new Error(`Unknown property '${key}' for LinkType`);
      }

      await super.postUpdate(content, updateKey, op);
    }
  }

  /**
   * List where link type is used.
   * Always returns card key references first, then calculation references.
   *
   * @param cards Optional. Check these cards for usage of this resource. If undefined, will check all cards.
   * @returns array of card keys calculation filenames that refer this resource.
   */
  public async usage(cards?: Card[]): Promise<string[]> {
    const resourceName = resourceNameToString(this.resourceName);
    const allCards = cards || super.cards();

    const cardsThatUseLinkType = allCards
      .filter((card) =>
        card.metadata?.links.find((item) => item.linkType === resourceName),
      )
      .filter(Boolean)
      .map((card) => card.key);

    const [cardContentReferences, calculations] = await Promise.all([
      super.usage(allCards),
      super.calculations(),
    ]);

    const cardReferences = [
      ...cardsThatUseLinkType,
      ...cardContentReferences,
    ].sort(sortCards);

    // Using Set to avoid duplicate cards
    return [...new Set([...cardReferences, ...calculations])];
  }
}
