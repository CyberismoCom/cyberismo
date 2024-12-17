/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { DefaultContent } from '../create-defaults.js';
import { FileResource } from './file-resource.js';
import { FileResources, LinkType } from '../interfaces/resource-interfaces.js';
import { Project } from '../containers/project.js';
import { ResourceName, resourceNameToString } from '../utils/resource-utils.js';

/**
 * Link Type resource class.
 * missing func:
 * - when renamed, update all affected cards
 */
export class LinkTypeResource extends FileResource {
  constructor(project: Project, name: ResourceName) {
    super(project, name, 'linkTypes');

    this.contentSchemaId = 'linkTypeSchema';
    this.contentSchema = super.contentSchemaContent(this.contentSchemaId);

    this.initialize();
  }

  public async create(newContent?: FileResources) {
    if (!newContent) {
      newContent = DefaultContent.linkTypeContent(
        resourceNameToString(this.resourceName),
      );
    }
    return super.create(newContent as unknown as LinkType);
  }

  public async delete() {
    return super.delete();
  }

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

  public async validate() {
    return super.validate();
  }

  public async update<Type>(key: string, value: Type) {
    await super.update(key, value);
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

    return super.postUpdate(linkTypeContent, key, value);
  }
}
