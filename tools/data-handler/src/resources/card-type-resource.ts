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
import { AddOperation, ChangeOperation } from './resource-object.js';

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

  // Collects affected cards.
  private async collectCards(cardContent: object) {
    async function filteredCards(
      cardSource: Promise<Card[]>,
      cardTypeName: string,
    ): Promise<Card[]> {
      const cards = await cardSource;
      return cards.filter((card) => card.metadata?.cardType === cardTypeName);
    }

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
    // Return all affected cards
    const cards = (
      await Promise.all([projectCardsPromise, ...templateCardsPromises])
    ).reduce((accumulator, value) => accumulator.concat(value), []);
    return cards;
  }

  // If custom fields change, cards need to be updated.
  // Rename change changes key names in cards.
  private async handleCustomFieldsChange<Type>(op: Operation<Type>) {
    const cardContent = {
      metadata: true,
      content: true,
    };

    if (op && op.name === 'change') {
      const from = (op as ChangeOperation<string>).target;
      const to = (op as ChangeOperation<string>).to;

      // Collect both project cards and template cards.
      const cards = await this.collectCards(cardContent);
      // Then update them all parallel.
      const promises: Promise<void>[] = [];
      for (const card of cards) {
        promises.push(this.updateCardMetadata(card, from, to));
      }
      await Promise.all(promises);
    }
    if (op && (op.name === 'add' || op.name === 'remove')) {
      const item = (op as AddOperation<Type>).target as CustomField;
      const cards = await this.collectCards(cardContent);
      if (op.name === 'add') {
        await this.handleAddNewField(cards, item);
      } else {
        await this.handleRemoveField(cards, item);
      }
    }
  }

  // When new field is added, add it all affected cards with 'null' value.
  private async handleAddNewField(cards: Card[], item: CustomField) {
    for (const card of cards) {
      if (card.metadata) {
        card.metadata[item.name] = null;
        await this.project.updateCardMetadata(card, card.metadata, true);
      }
    }
  }

  // When resource name changes.
  private async handleNameChange(existingName: string) {
    await Promise.all([
      this.updateLinkTypes(existingName),
      super.updateHandleBars(existingName, this.content.name),
      super.updateCalculations(existingName, this.content.name),
    ]);
  }

  // When new field is removed, add it all affected cards with 'null' value.
  private async handleRemoveField(cards: Card[], item: CustomField) {
    for (const card of cards) {
      if (card.metadata) {
        delete card.metadata[item.name];
        await this.project.updateCardMetadata(card, card.metadata, true);
      }
    }
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
          const op: ChangeOperation<string> = {
            name: 'change',
            target: oldName,
            to: this.content.name,
          } as ChangeOperation<string>;
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
    return this.handleNameChange(existingName);
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
   * @param op Operation to perform on 'key'
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
      content.customFields = super.handleArray(
        op,
        key,
        content.customFields as Type[],
      ) as CustomField[];

      // Once the actual key has been changed, check if anything else needs to be updated.
      if (op.name === 'change') {
        const from = (op as ChangeOperation<string>).target;
        const to = (op as ChangeOperation<string>).to;

        // Changed item can be in two other arrays.
        content.optionallyVisibleFields = content.optionallyVisibleFields?.map(
          (item) => (item === from ? to : item),
        );
        content.alwaysVisibleFields = content.alwaysVisibleFields?.map(
          (item) => (item === from ? to : item),
        );
      }
    } else {
      throw new Error(`Unknown property '${key}' for CardType`);
    }

    await super.postUpdate(content, key, op);

    // Renaming this card type causes that references to its name must be updated.
    if (nameChange) {
      return this.handleNameChange(existingName);
    } else if (customFieldsChange) {
      return this.handleCustomFieldsChange(op as ChangeOperation<string>);
    }
  }

  /**
   * Validates the resource. If object is invalid, throws.
   */
  public async validate(content?: object) {
    return super.validate(content);
  }
}
