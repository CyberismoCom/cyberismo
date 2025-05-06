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

import {
  DefaultContent,
  FileResource,
  resourceNameToString,
  sortCards,
} from './file-resource.js';

import type {
  Card,
  Operation,
  Project,
  ResourceName,
} from './file-resource.js';
import type { LinkType } from '../interfaces/resource-interfaces.js';

/**
 * Link Type resource class.
 */
export class LinkTypeResource extends FileResource {
  constructor(project: Project, name: ResourceName) {
    super(project, name, 'linkTypes');

    this.contentSchemaId = 'linkTypeSchema';
    this.contentSchema = super.contentSchemaContent(this.contentSchemaId);

    this.initialize();
  }

  // When resource name changes.
  private async handleNameChange(existingName: string) {
    const current = this.content as LinkType;
    const prefixes = await this.project.projectPrefixes();
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
   * Returns content data.
   */
  public get data() {
    return super.data as LinkType;
  }

  /**
   * Deletes file(s) from disk and clears out the memory resident object.
   */
  public async delete() {
    return super.delete();
  }

  /**
   * Renames resource metadata file and renames memory resident object 'name'.
   * @param newName New name for the resource.
   */
  public async rename(newName: ResourceName) {
    const existingName = this.content.name;
    await super.rename(newName);
    return this.handleNameChange(existingName);
  }

  /**
   * Shows metadata of the resource.
   * @returns link type metadata.
   */
  public async show(): Promise<LinkType> {
    return super.show() as Promise<LinkType>;
  }

  /**
   * Updates link type resource.
   * @param key Key to modify
   * @param op Operation to perform on 'key'
   */
  public async update<Type>(key: string, op: Operation<Type>) {
    const nameChange = key === 'name';
    const existingName = this.content.name;

    await super.update(key, op);

    const content = this.content as LinkType;
    if (key === 'name') {
      content.name = super.handleScalar(op) as string;
    } else if (key === 'destinationCardTypes') {
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
      throw new Error(`Unknown property '${key}' for FieldType`);
    }

    await super.postUpdate(content, key, op);

    // Renaming this card type causes that references to its name must be updated.
    if (nameChange) {
      await this.handleNameChange(existingName);
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
    const allCards = cards || (await super.cards());

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

  /**
   * Validates the resource. If object is invalid, throws.
   */
  public async validate(content?: object) {
    return super.validate(content);
  }
}
