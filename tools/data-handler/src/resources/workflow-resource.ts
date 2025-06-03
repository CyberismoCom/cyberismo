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
  Workflow,
  WorkflowState,
  WorkflowTransition,
} from '../interfaces/resource-interfaces.js';
import { CardTypeResource } from './card-type-resource.js';
import type {
  Card,
  ChangeOperation,
  Operation,
  Project,
  RemoveOperation,
  ResourceName,
} from './file-resource.js';
import {
  DefaultContent,
  FileResource,
  resourceNameToString,
  sortCards,
} from './folder-resource.js';
import { ResourcesFrom } from '../containers/project.js';
import { resourceName } from './file-resource.js';

/**
 * Workflow resource class.
 */
export class WorkflowResource extends FileResource {
  constructor(project: Project, name: ResourceName) {
    super(project, name, 'workflows');

    this.contentSchemaId = 'workflowSchema';
    this.contentSchema = super.contentSchemaContent(this.contentSchemaId);

    this.initialize();
  }

  // Collect all cards that use this workflow.
  private async collectCardsUsingWorkflow(): Promise<Card[]> {
    const cardTypes = await this.project.cardTypes(ResourcesFrom.localOnly);
    const promises: Promise<Card[]>[] = [];
    for (const cardType of cardTypes) {
      const object = new CardTypeResource(
        this.project,
        resourceName(cardType.name),
      );
      if (
        object.data &&
        (object.data as CardType).workflow ===
          resourceNameToString(this.resourceName)
      ) {
        // fetch all cards with card type
        promises.push(this.collectCards({ metadata: true }, cardType.name));
      }
    }
    return (await Promise.all(promises)).flat();
  }

  // When resource name changes.
  private async handleNameChange(existingName: string) {
    await Promise.all([
      super.updateHandleBars(existingName, this.content.name),
      super.updateCalculations(existingName, this.content.name),
    ]);
    // Finally, write updated content.
    await this.write();
  }

  // Handle change of workflow state.
  private async handleStateChange(op: ChangeOperation<WorkflowState>) {
    const content = { ...(this.content as Workflow) };
    const stateName = (
      (op.target as WorkflowState).name
        ? (op.target as WorkflowState).name
        : op.target
    ) as string;
    // Check that state can be changed to
    content.transitions = content.transitions.filter(
      (t) => t.toState !== stateName,
    );
    content.transitions.forEach((t) => {
      t.fromState = t.fromState.filter((state) => state !== stateName);
    });
    // validate that new state contains 'name' and 'category'
    if (op.to.name === undefined || op.to.category === undefined) {
      throw new Error(
        `Cannot change state '${stateName}' for workflow '${this.content.name}'.
         Updated state must have 'name' and 'category' properties.`,
      );
    }
    // Update all cards that use this state.
    const toStateName = op.to.name;

    await this.updateCardStates(stateName, toStateName);
  }

  // Handle removal of workflow state.
  // State can be removed with or without replacement.
  private async handleStateRemoval(op: RemoveOperation<WorkflowState>) {
    const content = { ...(this.content as Workflow) };
    const stateName = (
      (op.target as WorkflowState).name
        ? (op.target as WorkflowState).name
        : op.target
    ) as string;

    // If there is no replacement value, remove all transitions "to" and "from" this state.
    if (!op.replacementValue) {
      content.transitions = content.transitions.filter(
        (t) => t.toState !== stateName,
      );
      content.transitions.forEach((t) => {
        t.fromState = t.fromState.filter((state) => state !== stateName);
      });
    } else {
      // Replace transitions "to" the removed state with the replacement state.
      const replacementState = op.replacementValue;
      const stateExists = content.states.some(
        (state) => state.name === replacementState.name,
      );
      if (!stateExists) {
        throw new Error(
          `Cannot change to unknown state '${replacementState.name}' for Workflow`,
        );
      }

      content.transitions.forEach((t) => {
        if (t.toState === stateName) {
          t.toState = replacementState.name;
        }
      });
      // Replace transitions "from" the removed state with the replacement state.
      content.transitions.forEach((t) => {
        t.fromState = t.fromState.map((state) =>
          state === stateName ? replacementState.name : state,
        );
      });
      // Update all cards that use this state.
      await this.updateCardStates(stateName, replacementState.name);
    }
  }

  // Check if operation is a string operation.
  private isStringOperation(op: Operation<unknown>): op is Operation<string> {
    return typeof op.target === 'string';
  }

  // Update card states when state is changed
  private async updateCardStates(oldState: string, newState: string) {
    const cards = await this.collectCardsUsingWorkflow();
    cards.forEach(async (card) => {
      if (card.metadata?.workflowState === oldState) {
        card.metadata.workflowState = newState;
        await this.project.updateCardMetadata(card, card.metadata);
      }
    });
  }

  // Update dependant card types.
  private async updateCardTypes(oldName: string) {
    const cardTypes = await this.project.cardTypes(ResourcesFrom.localOnly);
    const op = {
      name: 'change',
      target: oldName,
      to: this.content.name,
    } as ChangeOperation<string>;
    for (const cardType of cardTypes) {
      const object = new CardTypeResource(
        this.project,
        resourceName(cardType.name),
      );
      if (object.data && (object.data as CardType).workflow === oldName) {
        await object.update('workflow', op);
      }
    }
  }

  /**
   * Sets new metadata into the workflow object.
   * @param newContent metadata content for the workflow.
   * @throws if 'newContent' is not valid.
   */
  public async create(newContent?: Workflow) {
    if (!newContent) {
      newContent = DefaultContent.workflow(
        resourceNameToString(this.resourceName),
      );
    } else {
      await this.validate(newContent);
    }
    return super.create(newContent);
  }

  /**
   * Returns content data.
   */
  public get data(): Workflow {
    return super.data as Workflow;
  }

  /**
   * Deletes file that this object is based on.
   * If there are card types that depended on this workflow, they are now invalid.
   */
  public async delete() {
    return super.delete();
  }

  /**
   * Renames the object and the file.
   * @param newName New name for the resource.
   */
  public async rename(newName: ResourceName) {
    const existingName = this.content.name;
    await super.rename(newName);
    return this.handleNameChange(existingName);
  }

  /**
   * Shows metadata of the resource.
   * @returns workflow metadata.
   */
  public async show(): Promise<Workflow> {
    return super.show() as Promise<Workflow>;
  }

  /**
   * Updates workflow resource.
   * @param key Key to modify
   * @param op Operation to perform on 'key'
   * @throws if key is unknown.
   */
  public async update<Type>(key: string, op: Operation<Type>) {
    const nameChange = key === 'name';
    const existingName = this.content.name;

    await super.update(key, op);

    const content = { ...(this.content as Workflow) };

    if (key === 'name') {
      content.name = super.handleScalar(op) as string;
    } else if (key === 'states') {
      content.states = super.handleArray(
        op,
        key,
        content.states as Type[],
      ) as WorkflowState[];
    } else if (key === 'transitions') {
      content.transitions = super.handleArray(
        op,
        key,
        content.transitions as WorkflowTransition[] as Type[],
      ) as WorkflowTransition[];
    } else {
      throw new Error(`Unknown property '${key}' for Workflow`);
    }

    if (key === 'states' && op.name === 'remove') {
      // If workflow state is removed, remove all transitions "to" and "from" this state.
      let removeOp: RemoveOperation<WorkflowState>;
      if (this.isStringOperation(op)) {
        const toBeRemovedState = (this.content as Workflow).states.find(
          (state) => state.name === op.target,
        );
        removeOp = {
          name: 'remove',
          target: toBeRemovedState as WorkflowState,
        };
      } else {
        removeOp = op as RemoveOperation<WorkflowState>;
      }
      await this.handleStateRemoval(removeOp);
    } else if (key === 'states' && op.name === 'change') {
      // If workflow state is renamed, replace all transitions "to" and "from" the old state with new state.
      let changeOp: ChangeOperation<WorkflowState>;
      if (this.isStringOperation(op)) {
        const toBeChangedState = (this.content as Workflow).states.find(
          (state) => state.name === op.target,
        );
        changeOp = {
          name: 'change',
          target: toBeChangedState as WorkflowState,
          to: { name: op.to },
        };
      } else {
        changeOp = op as ChangeOperation<WorkflowState>;
      }
      await this.handleStateChange(changeOp);
    }

    await super.postUpdate(content, key, op);

    // Renaming this workflow causes that references to its name must be updated.
    if (nameChange) {
      await this.handleNameChange(existingName);
      await this.updateCardTypes(existingName);
    }
  }

  /**
   * List where workflow is used.
   * Always returns card key references first, then any resource references and finally calculation references.
   *
   * @param cards Optional. Check these cards for usage of this resource. If undefined, will check all cards.
   * @returns array of card keys, resource names and calculation filenames that refer this resource.
   */
  public async usage(cards?: Card[]): Promise<string[]> {
    const resourceName = resourceNameToString(this.resourceName);
    const allCards = cards ?? (await super.cards());
    const cardTypes = await this.project.cardTypes(ResourcesFrom.all);
    const cardTypeReferences = await Promise.all(
      cardTypes.map(async (cardType) => {
        const metadata = await this.project.resource<CardType>(cardType.name);
        return metadata?.workflow === resourceName ? cardType.name : null;
      }),
    );

    const [relevantCards, calculations] = await Promise.all([
      super.usage(allCards),
      super.calculations(),
    ]);

    return [
      ...relevantCards.sort(sortCards),
      ...cardTypeReferences.filter((name): name is string => name !== null),
      ...calculations,
    ];
  }

  /**
   * Validates workflow.
   * @throws when there are validation errors.
   */
  public validate(content?: object): Promise<void> {
    return super.validate(content);
  }
}
