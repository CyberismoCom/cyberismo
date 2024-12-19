/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/
import { Card } from '../interfaces/project-interfaces.js';
import {
  CardType,
  CustomField,
  LinkType,
} from '../interfaces/resource-interfaces.js';
import { DefaultContent } from '../create-defaults.js';
import { FileResource, Operation } from './file-resource.js';
import { LinkTypeResource } from './link-type-resource.js';
import { Project, ResourcesFrom } from '../containers/project.js';
import {
  ResourceName,
  resourceName,
  resourceNameToString,
} from '../utils/resource-utils.js';
import { Template } from '../containers/template.js';
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

  // Update changed custom fields to cards
  private async updateCardMetadata(card: Card, from: string, to: string) {
    if (card.metadata?.cardType && card.metadata?.cardType.length > 0) {
      if (card.metadata && Object.keys(card.metadata).includes(from)) {
        // console.error(`updateCardMetadata: ${card.key} ${from} --> ${to}`);

        delete Object.assign(card.metadata, {
          [to]: card.metadata[from],
        })[from];

        const skipValidation = true;
        await this.project.updateCardMetadata(
          card,
          card.metadata,
          skipValidation,
        );
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

  /**
   * Updates card type resource.
   * @param key Key to modify
   * @param value New value.
   */
  public async update<Type>(key: string, value: Type, op?: Operation) {
    console.error(
      `update: ${this.content.name}
       key=${key}
       value=${value}
       op=${op?.operation}`,
    );

    const nameChange = key === 'name';
    const fieldsChange = key === 'customFields';
    const existingName = this.content.name;
    await super.update(key, value, op);

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
      if (!op) {
        // @todo: if whole 'customFields' is given as new array without Operation?
        //        it can be rather tedious to check the array for changes
        cardTypeContent.customFields = value as CustomField[];
      } else {
        if (op.operation === 'rename') {
          const from = op.from!;
          const to = op.to!;
          cardTypeContent.customFields = cardTypeContent.customFields.map(
            (item) => {
              if (item.name === from) {
                item.name = to;
              }
              return item;
            },
          );
          // Changed item can be in other two arrays.
          cardTypeContent.optionallyVisibleFields =
            cardTypeContent.optionallyVisibleFields?.map((item) =>
              item === from ? to : item,
            );
          cardTypeContent.alwaysVisibleFields =
            cardTypeContent.alwaysVisibleFields?.map((item) =>
              item === from ? to : item,
            );
        }
      }
    } else {
      throw new Error(`Unknown property '${key}' for CardType`);
    }

    if (op) {
      await super.postUpdate(cardTypeContent, key, cardTypeContent);
    } else {
      await super.postUpdate(cardTypeContent, key, value);
    }

    // After this resource has been updated, update the dependents.
    if (nameChange) {
      await this.updateLinkTypes(existingName);
      await super.updateHandleBars(existingName, this.content.name);
      await super.updateCalculations(existingName, this.content.name);
      return;
    }

    // If custom fields change, cards need to be updated.
    // Rename change changes key names in cards. (done)
    // Deletion removes keys and values in cards. (todo)
    // Addition adds key with default values in cards. (todo)
    // Data type change indicates which cards need to be manually changed. (todo)

    if (fieldsChange) {
      const cardContent = {
        metadata: true,
        content: true,
      };
      const projectCards = await this.project.cards(
        this.project.paths.cardRootFolder,
        cardContent,
      );

      if (op && op.operation === 'rename') {
        const from = op.from!;
        const to = op.to!;

        // console.error(`There are ${projectCards.length} project cards`);
        for (const card of projectCards) {
          await this.updateCardMetadata(card, from, to);
        }
        const templates = await this.project.templates(ResourcesFrom.localOnly);
        for (const template of templates) {
          const templateObject = new Template(this.project, template);
          const templateCards = await templateObject.cards('', cardContent);
          for (const card of templateCards) {
            // console.error(
            //   `There are ${templateCards.length} template cards in ${template.name}`,
            // );
            await this.updateCardMetadata(card, from, to);
          }
        }
      }
    }
  }

  /**
   * Validates the resource. If object is invalid, throws.
   */
  public async validate() {
    return super.validate();
  }
}
