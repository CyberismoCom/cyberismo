/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2024

  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import type {
  CardType,
  CustomField,
  LinkType,
  UpdateKey,
  Workflow,
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
import { Validate } from '../commands/index.js';

/**
 * Card type resource class.
 */
export class CardTypeResource extends FileResource<CardType> {
  constructor(project: Project, name: ResourceName) {
    super(project, name, 'cardTypes');

    this.contentSchemaId = 'cardTypeSchema';
    this.contentSchema = super.contentSchemaContent(this.contentSchemaId);

    this.setContainerValues();
  }

  // Returns cards that have this card type.
  private cardsWithCardType(cards: Card[]): string[] {
    const resourceName = resourceNameToString(this.resourceName);
    return cards
      .filter((card) => card.metadata?.cardType === resourceName)
      .map((card) => card.key);
  }

  // Checks if field type exists in the project.
  private async fieldTypeExists(field: Partial<CustomField>) {
    return field && field.name
      ? this.project.resourceExists('fieldTypes', field.name)
      : false;
  }

  // If custom fields change, cards need to be updated.
  // Rename change changes key names in cards.
  private async handleCustomFieldsChange<Type>(op: Operation<Type>) {
    if (op && op.name === 'rank') return;

    // Collect both project cards and template cards.
    const cards = await this.collectCards(this.content.name);

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
    const current = this.content;
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

  // Apply state mapping to all cards using this card type.
  // Checks that all states in the current workflow are updated.
  private async handleWorkflowChange<Type>(
    stateMapping: Record<string, string>,
    op: ChangeOperation<Type>,
  ) {
    await this.verifyStateMapping(stateMapping, op);
    const cards = await this.collectCards(this.content.name);

    const unmappedStates: string[] = [];

    // Update each card's workflowState if it has a mapping
    const updatePromises = cards.map(async (card) => {
      if (card.metadata && card.metadata.workflowState) {
        const currentState = card.metadata.workflowState;
        const newState = stateMapping[currentState];

        if (newState && newState !== currentState) {
          this.logger.info(
            `Updating card '${card.key}': ${currentState} -> ${newState}`,
          );
          card.metadata.workflowState = newState;
          await this.project.updateCardMetadata(card, card.metadata);
        } else if (!newState && !unmappedStates.includes(currentState)) {
          unmappedStates.push(currentState);
        }
      }
    });

    await Promise.all(updatePromises);

    if (unmappedStates.length > 0) {
      this.logger.warn(
        `Found unmapped states that were not updated: ${unmappedStates.join(', ')}`,
      );
    }
  }

  // Checks if field type exists in this card type.
  private hasFieldType(field: Partial<CustomField>): boolean {
    return (
      this.data?.customFields.some((item) => item.name === field.name) || false
    );
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
  private removeValueFromOtherArrays<Type>(
    op: Operation<Type>,
    content: CardType,
  ) {
    // Update target can be a string, or an object. Of object, fetch only 'name'
    // todo: fetching 'name' or using string as name could be function in resource base class.
    const target = (op as RemoveOperation<Type>).target as Type;
    let field = undefined;
    if (target['name' as keyof Type]) {
      field = { name: target['name' as keyof Type] };
    }
    const fieldName = (field ? field.name : target) as string;
    this.removeValue(content.alwaysVisibleFields, fieldName);
    this.removeValue(content.optionallyVisibleFields, fieldName);
  }

  // Sets content container values to be either '[]' or with proper values.
  private setContainerValues() {
    const content = this.content;
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
          updates.push(object.update({ key: field }, op));
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

  // Checks that field type exists in the project and is defined in this card type.
  private async validateFieldType<Type>(
    key: string,
    op: Operation<Type>,
  ): Promise<void> {
    const field =
      typeof op.target === 'object'
        ? (op.target as CustomField)
        : { name: op.target as string };
    // Check that field type exists in the project.
    const exists = await this.fieldTypeExists(field);
    if (!exists) {
      throw new Error(
        `Field type '${field.name}' does not exist in the project`,
      );
    }
    // Check that field type is defined in card type.
    if (key === 'alwaysVisibleFields' || key === 'optionallyVisibleFields') {
      const hasField = await this.hasFieldType(field);
      if (!hasField) {
        throw new Error(
          `Field type '${field.name}' is not defined in card type '${this.content.name}'`,
        );
      }
    }
  }

  // Verifies that:
  // - all states in the current workflow are covered in the state mapping
  // - the states are correct
  private async verifyStateMapping<Type>(
    stateMapping: Record<string, string>,
    op: ChangeOperation<Type>,
  ) {
    const currentWorkflowName = op.target as string;
    const currentWorkflow =
      await this.project.resource<Workflow>(currentWorkflowName);
    if (!currentWorkflow) {
      throw new Error(
        `Workflow '${currentWorkflowName}' does not exist in the project`,
      );
    }

    const newWorkflow = await this.project.resource<Workflow>(op.to as string);
    if (!newWorkflow) {
      throw new Error(`Workflow '${op.to}' does not exist in the project`);
    }

    const currentWorkflowStates = currentWorkflow.states.map(
      (state) => state.name,
    );
    const mappedSourceStates = Object.keys(stateMapping);
    const unmappedCurrentStates = currentWorkflowStates.filter(
      (stateName) => !mappedSourceStates.includes(stateName),
    );

    if (unmappedCurrentStates.length > 0) {
      throw new Error(
        `State mapping validation failed: The following states exist in the current workflow '${currentWorkflowName}' ` +
          `but are not mapped from in the state mapping JSON file: ${unmappedCurrentStates.join(', ')}. ` +
          `Please ensure all states in the current workflow are accounted for in the mapping to ensure all cards are properly updated.`,
      );
    }

    // Also verify that all target states exist in the new workflow
    const newWorkflowStates = newWorkflow.states.map((state) => state.name);
    const mappedTargetStates = Object.values(stateMapping);
    const invalidTargetStates = mappedTargetStates.filter(
      (stateName) => !newWorkflowStates.includes(stateName),
    );

    if (invalidTargetStates.length > 0) {
      throw new Error(
        `State mapping validation failed: The following target states in the mapping do not exist in the new workflow '${op.to}': ${invalidTargetStates.join(', ')}.`,
      );
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
    const validWorkflowName = Validate.getInstance().validResourceName(
      'workflows',
      resourceNameToString(resourceName(workflowName)),
      await this.project.projectPrefixes(),
    );
    const workflow = await this.project.resource<Workflow>(workflowName);
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
   * Renames resource metadata file and renames memory resident object 'name'.
   * @param newName New name for the resource.
   */
  public async rename(newName: ResourceName) {
    const existingName = this.content.name;
    await super.rename(newName);
    return this.handleNameChange(existingName);
  }

  /**
   * Updates card type resource.
   * @param key Key to modify
   * @param op Operation to perform on 'key'
   */
  public async update<Type, K extends string>(
    updateKey: UpdateKey<K>,
    op: Operation<Type>,
  ) {
    const { key } = updateKey;
    const nameChange = key === 'name';
    const customFieldsChange = key === 'customFields';
    const existingName = this.content.name;
    await super.update(updateKey, op);

    const content = structuredClone(this.content);
    if (key === 'name') {
      content.name = super.handleScalar(op) as string;
    } else if (key === 'alwaysVisibleFields') {
      await this.validateFieldType(key, op);
      content.alwaysVisibleFields = super.handleArray(
        op,
        key,
        content.alwaysVisibleFields as Type[],
      ) as string[];
    } else if (key === 'optionallyVisibleFields') {
      await this.validateFieldType(key, op);
      content.optionallyVisibleFields = super.handleArray(
        op,
        key,
        content.optionallyVisibleFields as Type[],
      ) as string[];
    } else if (key === 'workflow') {
      const changeOp = op as ChangeOperation<string>;
      const stateMapping = changeOp.mappingTable?.stateMapping || {};
      content.workflow = super.handleScalar(op) as string;
      if (Object.keys(stateMapping).length > 0) {
        await this.handleWorkflowChange(stateMapping, changeOp);
      }
    } else if (key === 'customFields') {
      await this.validateFieldType(key, op);
      content.customFields = super.handleArray(
        op,
        key,
        content.customFields as Type[],
      ) as CustomField[];
      if (op.name === 'remove') {
        this.removeValueFromOtherArrays(op, content);
      }
    } else if (key === 'description') {
      content.description = super.handleScalar(op) as string;
    } else if (key === 'displayName') {
      content.displayName = super.handleScalar(op) as string;
    } else {
      throw new Error(`Unknown property '${key}' for CardType`);
    }
    await super.postUpdate(content, updateKey, op);

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
    const allCards = cards ?? super.cards();
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
}
