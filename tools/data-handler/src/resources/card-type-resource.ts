/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/
import type {
  CardType,
  CustomField,
  LinkType,
} from '../interfaces/resource-interfaces.js';
import { FieldTypeResource } from './field-type-resource.js';
import {
  type AddOperation,
  type Card,
  type ChangeOperation,
  DefaultContent,
  FileResource,
  type Operation,
  type Project,
  type RemoveOperation,
  ResourcesFrom,
  type ResourceName,
  resourceName,
  resourceNameToString,
  sortCards,
} from './file-resource.js';
import { LinkTypeResource } from './link-type-resource.js';
import { Template } from '../containers/template.js';
import { Validate } from '../commands/index.js';

/**
 * Card type resource class.
 */
export class CardTypeResource extends FileResource {
  constructor(project: Project, name: ResourceName) {
    super(project, name, 'cardTypes');

    this.contentSchemaId = 'cardTypeSchema';
    this.contentSchema = super.contentSchemaContent(this.contentSchemaId);

    this.initialize();
    this.setContainerValues();
  }

  // Returns cards that have this card type.
  private async cardsWithCardType(cards: Card[]): Promise<string[]> {
    const resourceName = resourceNameToString(this.resourceName);
    return cards
      .filter((card) => card.metadata?.cardType === resourceName)
      .map((card) => card.key);
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

    if (op && op.name === 'rank') return;

    // Collect both project cards and template cards.
    const cards = await this.collectCards(cardContent);

    if (op && op.name === 'change') {
      const from = (op as ChangeOperation<string>).target;
      const to = (op as ChangeOperation<string>).to;

      // Then update them all parallel.
      const promises: Promise<void>[] = [];
      for (const card of cards) {
        promises.push(this.updateCardMetadata(card, from, to));
      }
      await Promise.all(promises);
    } else if (op && op.name === 'add') {
      // todo: target can be string here as well? Fix at some point
      const item = (op as AddOperation<Type>).target as CustomField;
      await this.handleAddNewField(cards, item);
    } else if (op && op.name === 'remove') {
      // todo: target can be string here as well? Fix at some point
      const item = (op as RemoveOperation<Type>).target as CustomField;
      await this.handleRemoveField(cards, item);
    }
  }

  // When new field is added, add it all affected cards with 'null' value.
  private async handleAddNewField(cards: Card[], item: CustomField) {
    for (const card of cards) {
      if (card.metadata) {
        card.metadata[item.name] = null;
        await this.project.updateCardMetadata(card, card.metadata);
      }
    }
  }

  // When resource name changes.
  private async handleNameChange(existingName: string) {
    const current = this.content as CardType;
    const prefixes = await this.project.projectPrefixes();
    if (current.customFields) {
      current.customFields.map(
        (field) =>
          (field.name = this.updatePrefixInResourceName(field.name, prefixes)),
      );
    }
    if (current.alwaysVisibleFields) {
      current.alwaysVisibleFields = current.alwaysVisibleFields.map((item) =>
        this.updatePrefixInResourceName(item, prefixes),
      );
    }
    if (current.optionallyVisibleFields) {
      current.optionallyVisibleFields = current.optionallyVisibleFields.map(
        (item) => this.updatePrefixInResourceName(item, prefixes),
      );
    }
    current.workflow = this.updatePrefixInResourceName(
      current.workflow,
      prefixes,
    );
    await Promise.all([
      super.updateHandleBars(existingName, this.content.name),
      super.updateCalculations(existingName, this.content.name),
    ]);
    // Finally, write updated content.
    await this.write();
  }

  // When a field is removed, remove it from all affected cards.
  private async handleRemoveField(cards: Card[], item: CustomField) {
    for (const card of cards) {
      if (card.metadata) {
        delete card.metadata[item.name];
        await this.project.updateCardMetadata(card, card.metadata);
      }
    }
  }

  // Remove value from array.
  // todo: make it as generic and move to utils
  private removeValue(array: string[], value: string) {
    const index = array.findIndex((element) => element === value);
    if (index !== -1) {
      array.splice(index, 1);
    }
  }

  // Return link types that use this card type.
  private async relevantLinkTypes(): Promise<string[]> {
    const resourceName = resourceNameToString(this.resourceName);
    const allLinkTypes = await this.project.linkTypes(ResourcesFrom.all);

    const linkTypeNames = await Promise.all(
      allLinkTypes.map(async (linkType) => {
        const metadata = await this.project.resource<LinkType>(linkType.name);
        if (!metadata) return null;

        const isRelevant =
          metadata.destinationCardTypes.includes(resourceName) ||
          metadata.sourceCardTypes.includes(resourceName);

        return isRelevant ? linkType.name : null;
      }),
    );

    return linkTypeNames.filter((name): name is string => name !== null);
  }

  // If value from 'customFields' is removed, remove it also from 'optionallyVisible' and 'alwaysVisible' arrays.
  private removeValueFromOtherArrays<Type>(op: Operation<Type>) {
    // Update target can be a string, or an object. Of object, fetch only 'name'
    // todo: fetching 'name' or using string as name could be function in resource base class.
    const target = (op as RemoveOperation<Type>).target as Type;
    let field = undefined;
    if (target['name' as keyof Type]) {
      field = { name: target['name' as keyof Type] };
    }
    const fieldName = (field ? field.name : target) as string;
    this.removeValue(this.data.alwaysVisibleFields, fieldName);
    this.removeValue(this.data.optionallyVisibleFields, fieldName);
  }

  // Sets content container values to be either '[]' or with proper values.
  private setContainerValues() {
    const content = this.content as CardType;
    if (content.customFields) {
      for (const item of content.customFields) {
        // Set "isCalculated" if it is missing; default = false
        if (item.isCalculated === undefined) {
          item.isCalculated = false;
        }
        // Fetch "displayName" from field type if it is missing.
        if (item.name && item.displayName === undefined) {
          const fieldType = new FieldTypeResource(
            this.project,
            resourceName(item.name),
          );
          const fieldTypeContent = fieldType.data;
          if (fieldTypeContent) {
            item.displayName = fieldTypeContent.displayName;
          }
        } else if (!item.name) {
          console.error(
            `Custom field '${item.name}' is missing mandatory 'name' in card type '${content.name}'`,
          );
          return undefined;
        }
      }
    } else {
      content.customFields = [];
    }
    if (!content.alwaysVisibleFields) {
      content.alwaysVisibleFields = [];
    }
    if (!content.optionallyVisibleFields) {
      content.optionallyVisibleFields = [];
    }
    this.content = content;
  }

  // Updates dependent link types.
  private async updateLinkTypes(oldName: string): Promise<void> {
    const linkTypes = await this.project.linkTypes(ResourcesFrom.localOnly);

    const updatePromises = linkTypes.map(async (linkType) => {
      const object = new LinkTypeResource(
        this.project,
        resourceName(linkType.name),
      );

      const data = object.data;
      const updates: Promise<void>[] = [];

      const cardTypeFields: Array<
        keyof Pick<LinkType, 'destinationCardTypes' | 'sourceCardTypes'>
      > = ['destinationCardTypes', 'sourceCardTypes'];

      for (const field of cardTypeFields) {
        if (data && data[field].includes(oldName)) {
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

        await this.project.updateCardMetadata(card, card.metadata);
      }
    }
  }

  /**
   * Creates a new card type object. Base class writes the object to disk automatically.
   * @param workflowName Workflow name that this card type uses.
   */
  public async createCardType(workflowName: string) {
    if (!workflowName) {
      throw new Error(
        `Cannot create cardType without providing workflow for it`,
      );
    }
    const validWorkflowName = await Validate.getInstance().validResourceName(
      'workflows',
      resourceNameToString(resourceName(workflowName)),
      await this.project.projectPrefixes(),
    );
    const workflow = await this.project.resource(workflowName);
    if (!workflow) {
      throw new Error(
        `Workflow '${workflowName}' does not exist in the project`,
      );
    }
    const content = DefaultContent.cardType(
      resourceNameToString(this.resourceName),
      validWorkflowName,
    );
    return super.create(content);
  }

  /**
   * Returns content data.
   */
  public get data(): CardType {
    return super.data as CardType;
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
      if (op.name === 'remove') {
        this.removeValueFromOtherArrays(op);
      }
    } else {
      throw new Error(`Unknown property '${key}' for CardType`);
    }

    await super.postUpdate(content, key, op);

    // Renaming this card type causes that references to its name must be updated.
    if (nameChange) {
      await this.handleNameChange(existingName);
      await this.updateLinkTypes(existingName);
    } else if (customFieldsChange) {
      return this.handleCustomFieldsChange(op as ChangeOperation<string>);
    }
  }

  /**
   * List where card type is used. This includes card metadata, card content, calculations and link type resources.
   * Always returns card key references first, then any resource references and finally calculation references.
   *
   * @param cards Optional. Check these cards for usage of this resource. If undefined, will check all cards.
   * @returns array of card keys, resource names and calculation filenames that refer this resource.
   */
  public async usage(cards?: Card[]): Promise<string[]> {
    const allCards = cards ?? (await super.cards());
    const [
      cardsWithCardType,
      cardContentReferences,
      relevantLinkTypes,
      calculations,
    ] = await Promise.all([
      this.cardsWithCardType(allCards),
      super.usage(allCards),
      this.relevantLinkTypes(),
      super.calculations(),
    ]);
    const cardReferences = [
      ...cardsWithCardType,
      ...cardContentReferences,
    ].sort(sortCards);

    // Using Set to avoid duplicate cards
    return [
      ...new Set([...cardReferences, ...relevantLinkTypes, ...calculations]),
    ];
  }

  /**
   * Validates the resource. If object is invalid, throws.
   */
  public async validate(content?: object) {
    return super.validate(content);
  }
}
