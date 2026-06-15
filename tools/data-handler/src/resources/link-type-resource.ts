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
import { resourceName, resourceNameToString } from '../utils/resource-utils.js';
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
  /**
   * Creates instance of LinkTypeResource
   * @param project Project to use
   * @param name Resource name
   */
  constructor(project: Project, name: ResourceName) {
    super(project, name, 'linkTypes');

    this.contentSchemaId = 'linkTypeSchema';
    this.contentSchema = super.contentSchemaContent(this.contentSchemaId);
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
   * When the project prefix changes, rewrite the link type's own references
   * (its sourceCardTypes / destinationCardTypes) that carried the old prefix.
   * The cross-resource rename cascade lives in LinkTypeRenameHandler.
   * @param newPrefix New project prefix.
   */
  public async changePrefix(newPrefix: string) {
    // The persisted name carries the old prefix; resourceName may already be
    // re-keyed under the new one (see ResourceObject.changePrefix).
    const from = resourceName(this.content.name).prefix;
    const content = this.content;
    content.sourceCardTypes = content.sourceCardTypes.map((item) =>
      this.replacePrefix(item, from, newPrefix),
    );
    content.destinationCardTypes = content.destinationCardTypes.map((item) =>
      this.replacePrefix(item, from, newPrefix),
    );
    await super.changePrefix(newPrefix);
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

    if (this.isBaseProperty(key)) {
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
