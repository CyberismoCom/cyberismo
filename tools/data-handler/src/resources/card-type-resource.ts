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

import { DefaultContent } from './create-defaults.js';
import { FileResource } from './file-resource.js';
import { resourceName, resourceNameToString } from '../utils/resource-utils.js';
import { sortCards } from '../utils/card-utils.js';
import { Validate } from '../commands/validate.js';

import type { Operation } from './resource-object.js';
import type { Card } from '../interfaces/project-interfaces.js';
import type {
  CardType,
  CustomField,
  UpdateKey,
} from '../interfaces/resource-interfaces.js';
import type { Project } from '../containers/project.js';
import type { ResourceName } from '../utils/resource-utils.js';

/**
 * Card type resource class.
 */
export class CardTypeResource extends FileResource<CardType> {
  /**
   * Creates instance of CardTypeResource
   * @param project Project to use
   * @param name Resource name
   */
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
      ? this.project.resources.exists(field.name)
      : false;
  }

  // Checks if field type exists in this card type.
  private hasFieldType(field: Partial<CustomField>): boolean {
    return (
      this.data?.customFields.some((item) => item.name === field.name) || false
    );
  }

  // Return link types that use this card type.
  private relevantLinkTypes(): string[] {
    const resourceName = resourceNameToString(this.resourceName);
    const allLinkTypes = this.project.resources.linkTypes();
    const references: string[] = [];

    for (const linkType of allLinkTypes) {
      const metadata = linkType.data;
      if (!metadata) continue;

      const isRelevant =
        metadata.destinationCardTypes.includes(resourceName) ||
        metadata.sourceCardTypes.includes(resourceName);

      if (isRelevant) {
        references.push(metadata.name);
      }
    }

    return references;
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
        if (!item.name) {
          continue;
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
      const hasField = this.hasFieldType(field);
      if (!hasField) {
        throw new Error(
          `Field type '${field.name}' is not defined in card type '${this.content.name}'`,
        );
      }
    }
  }

  /**
   * When resource name changes.
   *
   * Cross-resource cascade (handlebar/calculation/card-content rewrites) lives
   * in CardTypeRenameHandler. Only the self-only prefix rewrites for the
   * card type's own metadata (customFields / alwaysVisibleFields /
   * optionallyVisibleFields / workflow) remain here.
   * @param _existingName Previous resource name (unused).
   */
  protected async onNameChange(_existingName: string) {
    const current = this.content;
    const prefixes = this.project.projectPrefixes();
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

    await this.write();
  }

  /**
   * Creates a new card type object. Base class writes the object to disk automatically.
   * @param workflowName Workflow name that this card type uses.
   * @throws when workflow is empty, or
   *         when workflow does not exist in the project.
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
      this.project.projectPrefixes(),
    );
    const workflow = this.project.resources
      .byType(workflowName, 'workflows')
      .show();
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
    return this.onNameChange(existingName);
  }

  /**
   * Updates card type resource.
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
      return;
    }
    const content = structuredClone(this.content);
    if (key === 'alwaysVisibleFields') {
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
      content.workflow = super.handleScalar(op) as string;
      // Cascade lives in CardTypeWorkflowChangeHandler.
    } else if (key === 'customFields') {
      await this.validateFieldType(key, op);
      content.customFields = super.handleArray(
        op,
        key,
        content.customFields as Type[],
      ) as CustomField[];
      // Cascade lives in CardTypeAddCustomFieldHandler /
      // CardTypeRemoveCustomFieldHandler.
    } else {
      throw new Error(`Unknown property '${key}' for CardType`);
    }
    await super.postUpdate(content, updateKey, op);
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
