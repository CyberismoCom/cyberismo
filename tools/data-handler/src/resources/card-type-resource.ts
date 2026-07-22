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
import { removeValue } from '../utils/common-utils.js';
import { Validate } from '../commands/validate.js';

import type {
  ChangeOperation,
  Operation,
  RemoveOperation,
} from './resource-object.js';
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
    removeValue(content.alwaysVisibleFields, fieldName);
    removeValue(content.optionallyVisibleFields, fieldName);
  }

  // Refuse disabling override on a field that remains calculated while cards
  // still store override values: those stored values would become invalid
  // data that validation rejects. Toggling isCalculated off is not this
  // guard's concern - the field's stored values become plain (legal) values
  // again; any resulting "other cards now lack this field" gap is a
  // pre-existing isCalculated-toggle issue, out of scope here.
  private validateOverrideDisable<Type>(op: ChangeOperation<Type>) {
    const changed = op.to as unknown as Partial<CustomField>;
    if (!changed?.name) {
      return;
    }
    const current = this.content.customFields.find(
      (f) => f.name === changed.name,
    );
    const wasOverridable = !!(current?.isCalculated && current?.enableOverride);
    const disablesOverride = !!changed.isCalculated && !changed.enableOverride;
    if (!wasOverridable || !disablesOverride) {
      return;
    }
    const cardTypeName = resourceNameToString(this.resourceName);
    const cardsWithOverride = super
      .cards()
      .filter(
        (card) =>
          card.metadata?.cardType === cardTypeName &&
          card.metadata?.[changed.name as string] != null,
      )
      .map((card) => card.key);
    if (cardsWithOverride.length > 0) {
      throw new Error(
        `Cannot disable override for field '${changed.name}': ` +
          `cards [${cardsWithOverride.join(', ')}] have an override value. ` +
          `Clear the overrides first.`,
      );
    }
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
   * When the project prefix changes, rewrite the card type's own references
   * (its customFields / visible-fields / workflow) that carried the old
   * prefix. The cross-resource rename cascade lives in CardTypeRenameHandler.
   * @param newPrefix New project prefix.
   */
  public async changePrefix(newPrefix: string) {
    // The persisted name carries the old prefix; resourceName may already be
    // re-keyed under the new one (see ResourceObject.changePrefix).
    const from = resourceName(this.content.name).prefix;
    const content = this.content;
    content.customFields.forEach(
      (field) => (field.name = this.replacePrefix(field.name, from, newPrefix)),
    );
    content.alwaysVisibleFields = content.alwaysVisibleFields.map((item) =>
      this.replacePrefix(item, from, newPrefix),
    );
    content.optionallyVisibleFields = content.optionallyVisibleFields.map(
      (item) => this.replacePrefix(item, from, newPrefix),
    );
    content.workflow = this.replacePrefix(content.workflow, from, newPrefix);
    await super.changePrefix(newPrefix);
  }

  /**
   * Rewrites this card type's references to a renamed field type: the
   * matching customFields[].name entries (other entry properties such as
   * isCalculated are preserved) and the visible-fields arrays. Deliberately
   * non-validating: the field-type rename cascade uses this during
   * module-update replay, when the old field type is already gone from the
   * module tree so update()'s validateFieldType could never pass.
   * @param from Old field type name.
   * @param to New field type name.
   */
  public async renameFieldTypeReferences(from: string, to: string) {
    const content = this.content;
    let changed = false;
    const renameRef = (item: string) => {
      if (item !== from) return item;
      changed = true;
      return to;
    };
    for (const field of content.customFields) {
      field.name = renameRef(field.name);
    }
    content.alwaysVisibleFields = content.alwaysVisibleFields.map(renameRef);
    content.optionallyVisibleFields =
      content.optionallyVisibleFields.map(renameRef);
    if (changed) {
      await this.write();
    }
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
    } else {
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
      } else if (key === 'customFields') {
        await this.validateFieldType(key, op);
        if (op.name === 'change') {
          this.validateOverrideDisable(op as ChangeOperation<Type>);
        }
        content.customFields = super.handleArray(
          op,
          key,
          content.customFields as Type[],
        ) as CustomField[];
        if (op.name === 'remove') {
          this.removeValueFromOtherArrays(op, content);
        }
      } else {
        throw new Error(`Unknown property '${key}' for CardType`);
      }
      await super.postUpdate(content, updateKey, op);
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
