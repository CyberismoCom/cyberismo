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
import {
  AddOperation,
  RemoveOperation,
  RenameOperation,
} from './resource-object.js';

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

  // If custom fields change, cards need to be updated.
  // Rename change changes key names in cards. (done)
  // todo: Data type change indicates which cards need to be manually changed.
  private async doHandleCustomFieldsChange<Type>(op: Operation<Type>) {
    const cardContent = {
      metadata: true,
      content: true,
    };

    async function filteredCards(
      cardSource: Promise<Card[]>,
      cardTypeName: string,
    ): Promise<Card[]> {
      const cards = await cardSource;
      return cards.filter((card) => card.metadata?.cardType === cardTypeName);
    }

    if (op && op.name === 'change') {
      const from = (op as RenameOperation<string>).from;
      const to = (op as RenameOperation<string>).to;

      // Collect both project cards ...
      const projectCardsPromise = filteredCards(
        this.project.cards(this.project.paths.cardRootFolder, cardContent),
        this.content.name,
      );
      // ... and cards from each template that would be affected.
      const templates = await this.project.templates(ResourcesFrom.localOnly);
      const templateCardsPromises = templates.map((template) => {
        const templateObject = new Template(this.project, template);
        return filteredCards(
          templateObject.cards('', cardContent),
          this.content.name,
        );
      });

      // Then update them all parallel.
      const cards = (
        await Promise.all([projectCardsPromise, ...templateCardsPromises])
      ).reduce((accumulator, value) => accumulator.concat(value), []);
      const promises: Promise<void>[] = [];
      for (const card of cards) {
        promises.push(this.updateCardMetadata(card, from, to));
      }
      await Promise.all(promises);
    }
    if (op && op.name === 'add') {
      const item = (op as AddOperation<string>).item as unknown as CustomField;
      console.error(item);
      // todo
    }
    if (op && op.name === 'remove') {
      const item = (op as RemoveOperation<Type>).item as CustomField;
      console.error(item);

      // todo
    }
    // if (op && op.name === 'elementTypeChange') {
    //   // todo
    // }
  }

  // When resource name changes.
  private async doHandleNameChange(existingName: string) {
    await Promise.all([
      this.updateLinkTypes(existingName),
      super.updateHandleBars(existingName, this.content.name),
      super.updateCalculations(existingName, this.content.name),
    ]);
  }

  // Updates dependent link types.
  private async updateLinkTypes(oldName: string): Promise<void> {
    const linkTypes = await this.project.linkTypes(ResourcesFrom.localOnly);

    const updatePromises = linkTypes.map(async (linkType) => {
      const object = new LinkTypeResource(
        this.project,
        resourceName(linkType.name),
      );

      const data = object.data as LinkType;
      const updates: Promise<void>[] = [];

      const cardTypeFields: Array<
        keyof Pick<LinkType, 'destinationCardTypes' | 'sourceCardTypes'>
      > = ['destinationCardTypes', 'sourceCardTypes'];

      for (const field of cardTypeFields) {
        if (data[field].includes(oldName)) {
          const op: RenameOperation<string> = {
            name: 'change',
            from: oldName,
            to: this.content.name,
          } as RenameOperation<string>;
          updates.push(object.update(field, op));
        }
      }

      if (updates.length > 0) {
        await Promise.all(updates);
      }
    });
    await Promise.all(updatePromises);
  }

  // Update changed custom fields to cards
  private async updateCardMetadata(card: Card, from: string, to: string) {
    if (card.metadata?.cardType && card.metadata?.cardType.length > 0) {
      if (card.metadata && Object.keys(card.metadata).includes(from)) {
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
    if (!(await this.project.workflow(workflowName))) {
      throw new Error(
        `Workflow '${workflowName}' does not exist in the project`,
      );
    }
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
    const existingName = this.content.name;
    await super.rename(newName);
    return this.doHandleNameChange(existingName);
  }

  /**
   * Shows metadata of the resource.
   * @returns card type metadata.
   */
  public async show(): Promise<CardType> {
    return super.show() as Promise<CardType>;
  }

  /**
   * Updates card type resource.
   * @param key Key to modify
   * @param op
   */
  public async update<Type>(key: string, op: Operation<Type>) {
    const nameChange = key === 'name';
    const customFieldsChange = key === 'customFields';
    const existingName = this.content.name;
    await super.update(key, op);

    const content = this.content as CardType;
    if (key === 'name') {
      content.name = super.handleScalar(op) as string;
    } else if (key === 'alwaysVisibleFields') {
      content.alwaysVisibleFields = super.handleArray(
        op,
        key,
        content.alwaysVisibleFields as Type[],
      ) as string[];
    } else if (key === 'optionallyVisibleFields') {
      content.optionallyVisibleFields = super.handleArray(
        op,
        key,
        content.optionallyVisibleFields as Type[],
      ) as string[];
    } else if (key === 'workflow') {
      content.workflow = super.handleScalar(op) as string;
    } else if (key === 'customFields') {
      if (op.name === 'change') {
        const from = (op as RenameOperation<string>).from;
        const to = (op as RenameOperation<string>).to;
        content.customFields = content.customFields.map((item) => {
          if (item.name === from) {
            item.name = to;
          }
          return item;
        });
        // Changed item can be in two other arrays.
        content.optionallyVisibleFields = content.optionallyVisibleFields?.map(
          (item) => (item === from ? to : item),
        );
        content.alwaysVisibleFields = content.alwaysVisibleFields?.map(
          (item) => (item === from ? to : item),
        );
      } else if (op.name === 'add') {
        const newItem = (op as AddOperation<Type>).item as CustomField;
        const found = content.customFields.find(
          (item) => item.name === newItem.name,
        );
        if (!found) {
          content.customFields.push(newItem);
        }
      } else if (op.name === 'remove') {
        const newItem = (op as RemoveOperation<Type>).item as CustomField;
        const index = content.customFields.findIndex(
          (item) => item.name === newItem.name,
        );
        if (index > -1) {
          content.customFields.splice(index, 1);
        }
      }
    } else {
      throw new Error(`Unknown property '${key}' for CardType`);
    }

    await super.postUpdate(content, key, op);

    // After this resource has been updated, update the dependents.
    if (nameChange) {
      return this.doHandleNameChange(existingName);
    } else if (customFieldsChange) {
      return this.doHandleCustomFieldsChange(op as RenameOperation<string>);
    }
  }

  /**
   * Validates the resource. If object is invalid, throws.
   */
  public async validate(content?: object) {
    return super.validate(content);
  }
}
