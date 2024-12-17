/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import {
  CardType,
  CustomField,
  LinkType,
} from '../interfaces/resource-interfaces.js';
import { DefaultContent } from '../create-defaults.js';
import { FileResource } from './file-resource.js';
import { LinkTypeResource } from './link-type-resource.js';
import { Project, ResourcesFrom } from '../containers/project.js';
import {
  ResourceName,
  resourceName,
  resourceNameToString,
} from '../utils/resource-utils.js';
import { Validate } from '../validate.js';

/**
 * Card type resource class.
 */
export class CardTypeResource extends FileResource {
  constructor(project: Project, name: ResourceName) {
    super(project, name, 'cardTypes');

    this.contentSchemaId = 'cardTypeSchema';
    this.contentSchema = super.contentSchemaContent(this.contentSchemaId);

    this.initialize();
  }

  // Updates dependent link types.
  private async updateLinkTypes(oldName: string) {
    const linkTypes = await this.project.linkTypes(ResourcesFrom.localOnly);
    for (const linkType of linkTypes) {
      const object = new LinkTypeResource(
        this.project,
        resourceName(linkType.name),
      );
      const data = object.data as LinkType;
      if (data.destinationCardTypes.includes(oldName)) {
        const clonedArray = super.updateArray(
          data.destinationCardTypes,
          oldName,
          this.content.name,
        );
        await object.update('destinationCardTypes', clonedArray);
      }
      if (data.sourceCardTypes.includes(oldName)) {
        const clonedArray = super.updateArray(
          data.sourceCardTypes,
          oldName,
          this.content.name,
        );
        await object.update('sourceCardTypes', clonedArray);
      }
    }
  }

  /**
   * Creates a new card type object. Base class writes the object to disk automatically.
   * @param workflowName Workflow name that this card type uses.
   */
  public async createCardType(workflowName: string) {
    const validWorkflowName = await Validate.getInstance().validResourceName(
      'workflows',
      resourceNameToString(resourceName(workflowName)),
      await this.project.projectPrefixes(),
    );
    const content = DefaultContent.cardType(
      resourceNameToString(this.resourceName),
      validWorkflowName + '.json',
    );
    return super.create(content);
  }

  public async delete() {
    return super.delete();
  }

  public async rename(newName: ResourceName) {
    const oldName = this.content.name;
    await super.rename(newName);
    return this.updateLinkTypes(oldName);
  }

  /**
   * Shows metadata of the resource.
   * @returns card type metadata.
   */
  public async show(): Promise<CardType> {
    return super.show() as unknown as CardType;
  }

  public async validate() {
    return super.validate();
  }

  /**
   * Updates card type resource.
   * @param key Key to modify
   * @param value New value.
   */
  public async update<Type>(key: string, value: Type) {
    const rename = key === 'name';
    const existingName = this.content.name;
    await super.update(key, value);
    const cardTypeContent = this.content as unknown as CardType;
    if (key === 'name') {
      cardTypeContent.name = value as string;
    } else if (key === 'alwaysVisibleFields') {
      cardTypeContent.alwaysVisibleFields = value as string[];
    } else if (key === 'optionallyVisibleFields') {
      cardTypeContent.optionallyVisibleFields = value as string[];
    } else if (key === 'workflow') {
      cardTypeContent.workflow = value as string;
    } else if (key === 'customFields') {
      cardTypeContent.customFields = value as CustomField[];
      // todo: also change all cards that have this card type
    } else {
      throw new Error(`Unknown property '${key}' for CardType`);
    }

    await super.postUpdate(cardTypeContent, key, value);

    // After this resource has been updated, update the dependents.
    if (rename) {
      await this.updateLinkTypes(existingName);
    }
  }
}
