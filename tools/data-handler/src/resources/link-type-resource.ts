/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { DefaultContent } from '../create-defaults.js';
import { FileResource, Operation } from './file-resource.js';
import { FileResources, LinkType } from '../interfaces/resource-interfaces.js';
import { Project } from '../containers/project.js';
import { ResourceName, resourceNameToString } from '../utils/resource-utils.js';

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

  /**
   * Creates a new link type object. Base class writes the object to disk automatically.
   * @param newContent Content for the link type.
   */
  public async create(newContent?: FileResources) {
    if (!newContent) {
      newContent = DefaultContent.linkTypeContent(
        resourceNameToString(this.resourceName),
      );
    }
    return super.create(newContent as unknown as LinkType);
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
    return super.rename(newName);
  }

  /**
   * Shows metadata of the resource.
   * @returns link type metadata.
   */
  public async show(): Promise<LinkType> {
    return super.show() as unknown as LinkType;
  }

  /**
   * Updates link type resource.
   * @param key Key to modify
   * @param value New value.
   */
  public async update<Type>(key: string, value: Type, _op?: Operation) {
    const nameChange = key === 'name';
    const existingName = this.content.name;

    await super.update(key, value, _op);
    const linkTypeContent = this.content as unknown as LinkType;
    if (key === 'name') {
      linkTypeContent.name = value as string;
    } else if (key === 'destinationCardTypes') {
      linkTypeContent.destinationCardTypes = value as string[];
    } else if (key === 'enableLinkDescription') {
      linkTypeContent.enableLinkDescription = value as boolean;
    } else if (key === 'inboundDisplayName') {
      linkTypeContent.inboundDisplayName = value as string;
    } else if (key === 'outboundDisplayName') {
      linkTypeContent.outboundDisplayName = value as string;
    } else if (key === 'sourceCardTypes') {
      linkTypeContent.sourceCardTypes = value as string[];
    } else {
      throw new Error(`Unknown property '${key}' for FieldType`);
    }

    await super.postUpdate(linkTypeContent, key, value);

    if (nameChange) {
      await super.updateHandleBars(existingName, this.content.name);
      await super.updateCalculations(existingName, this.content.name);
    }
  }

  /**
   * Validates the resource. If object is invalid, throws.
   */
  public async validate() {
    return super.validate();
  }
}
