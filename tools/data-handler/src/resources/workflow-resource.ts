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
  UpdateKey,
  Workflow,
  WorkflowState,
  WorkflowTransition,
} from '../interfaces/resource-interfaces.js';
import { DefaultContent } from './create-defaults.js';
import { FileResource } from './file-resource.js';
import { resourceNameToString } from '../utils/resource-utils.js';
import { sortCards } from '../utils/card-utils.js';

import type { Card } from '../interfaces/project-interfaces.js';
import type {
  ChangeOperation,
  Operation,
  RemoveOperation,
} from './resource-object.js';
import type { Project } from '../containers/project.js';
import type { ResourceName } from '../utils/resource-utils.js';

/**
 * Workflow resource class.
 */
export class WorkflowResource extends FileResource<Workflow> {
  /**
   * Creates an instance of WorkflowResource
   * @param project Project to use
   * @param name Resource name
   */
  constructor(project: Project, name: ResourceName) {
    super(project, name, 'workflows');

    this.contentSchemaId = 'workflowSchema';
    this.contentSchema = super.contentSchemaContent(this.contentSchemaId);
  }

  // Collect all cards that use this workflow.
  private async collectCardsUsingWorkflow(): Promise<Card[]> {
    const cardTypes = this.project.resources.cardTypes();
    const promises: Promise<Card[]>[] = [];
    for (const cardType of cardTypes) {
      if (cardType.data?.workflow === resourceNameToString(this.resourceName)) {
        promises.push(
          this.collectCards(
            cardType.data.name,
            (card, cardTypeName) => card.metadata?.cardType === cardTypeName,
          ),
        );
      }
    }
    return (await Promise.all(promises)).flat();
  }

  // When resource name changes.
  protected async onNameChange(existingName: string) {
    await Promise.all([
      super.updateHandleBars(existingName, this.content.name),
      super.updateCalculations(existingName, this.content.name),
      super.updateCardContentReferences(existingName, this.content.name),
      this.updateCardTypes(existingName),
    ]);
    // Finally, write updated content.
    await this.write();
  }

  // Handle change of workflow state.
  private async handleStateChange(
    content: Workflow,
    op: ChangeOperation<WorkflowState>,
  ) {
    const stateName = this.targetName(op) as string;
    // validate that new state contains 'name' and 'category'
    if (op.to.name === undefined || op.to.category === undefined) {
      throw new Error(
        `Cannot change state '${stateName}' for workflow '${this.content.name}'.
         Updated state must have 'name' and 'category' properties.`,
      );
    }
    // Delete transitions to the old state and remove references from fromStates
    content.transitions = content.transitions.filter(
      (t) => t.toState !== stateName,
    );
    content.transitions.forEach((t) => {
      t.fromState = t.fromState.filter((state) => state !== stateName);
    });
    // Update all cards that use this state.
    const toStateName = op.to.name;

    await this.updateCardStates(stateName, toStateName);
  }

  // Handle removal of workflow state.
  // State can be removed with or without replacement.
  private async handleStateRemoval(
    content: Workflow,
    op: RemoveOperation<WorkflowState>,
  ) {
    const stateName = this.targetName(op) as string;

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

  // Returns target name irregardless of the type
  private targetName(op: Operation<WorkflowState | WorkflowTransition>) {
    const name = op.target.name ? op.target.name : op.target;
    return name;
  }

  // Potentially updates the changed transition with current properties.
  private transitionObject(op: ChangeOperation<WorkflowTransition>) {
    const content = structuredClone(this.content);
    const targetTransitionName = this.targetName(op);
    const currentTransition = content.transitions.filter(
      (item) => item.name === targetTransitionName,
    )[0];

    if (currentTransition) {
      op.to.fromState =
        op.to.fromState.length === 0
          ? currentTransition.fromState
          : op.to.fromState;
      op.to.toState = op.to.toState ?? currentTransition.toState;
    }

    if (
      op.to.name === undefined ||
      op.to.toState === undefined ||
      op.to.fromState == undefined ||
      op.to.fromState.length === 0
    ) {
      throw new Error(
        `Cannot change transition '${targetTransitionName}' for workflow '${this.content.name}'.
         Updated transition must have 'name', 'toState' and 'fromState' properties.`,
      );
    }
    return op.to;
  }

  // Update card states when state is changed
  private async updateCardStates(oldState: string, newState: string) {
    const cards = await this.collectCardsUsingWorkflow();
    const promises = cards
      .filter((card) => card.metadata?.workflowState === oldState)
      .map(async (card) => {
        card.metadata!.workflowState = newState;
        await this.project.updateCardMetadata(card, card.metadata!);
      });
    await Promise.all(promises);
  }

  // Update dependant card types.
  private async updateCardTypes(oldName: string) {
    const cardTypes = this.project.resources.cardTypes();
    const op = {
      name: 'change',
      target: oldName,
      to: this.content.name,
    } as ChangeOperation<string>;
    for (const cardType of cardTypes) {
      // Only update card types that use this workflow
      if (cardType.data?.workflow === oldName) {
        await cardType.update(
          {
            key: 'workflow',
          },
          op,
        );
      }
    }
  }

  /**
   * Sets new metadata into the workflow object.
   * @param newContent metadata content for the workflow.
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
   * Validates the content of the workflow resource.
   * @param content Content to be validated.
   * @throws if content is invalid.
   */
  public async validate(content?: Workflow) {
    // Base class run basic schema checks
    await super.validate(content);

    const workflowContent = content ?? this.content;

    const newCardTransitions = workflowContent.transitions.filter(
      (t) => t.fromState.includes('') || t.fromState.length === 0,
    );

    if (newCardTransitions.length !== 1) {
      throw new Error(
        `Workflow '${workflowContent.name}' must have exactly one transition from "New Card" (empty fromState), found ${newCardTransitions.length}.`,
      );
    }
  }

  /**
   * Renames the object and the file.
   * @param newName New name for the resource.
   */
  public async rename(newName: ResourceName) {
    const existingName = this.content.name;
    await super.rename(newName);
    return this.onNameChange(existingName);
  }

  /**
   * Updates workflow resource.
   * @param updateKey Key to modify
   * @param op Operation to perform on 'key'
   * @throws if key is unknown.
   */
  public async update<Type, K extends string>(
    updateKey: UpdateKey<K>,
    op: Operation<Type>,
  ) {
    const { key } = updateKey;

    if (key === 'name' || key === 'displayName' || key === 'description') {
      await super.update(updateKey, op);
    } else {
      const content = structuredClone(this.content) as Workflow;

      // Validate state change operations before processing
      if (key === 'states' && op.name === 'change') {
        const changeOp = op as ChangeOperation<WorkflowState>;
        if (
          changeOp.to.name === undefined ||
          changeOp.to.category === undefined
        ) {
          const stateName =
            changeOp.target['name' as keyof typeof changeOp.target] ||
            changeOp.target;
          throw new Error(
            `Cannot change state '${stateName}' for workflow '${this.content.name}'.
         Updated state must have 'name' and 'category' properties.`,
          );
        }
      }

      if (key === 'states') {
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

      // If workflow transition is removed, then above call to 'handleArray' is all that is needed.

      if (key === 'transitions' && op.name === 'change') {
        // If workflow transition is changed, update to full object and change the content.
        let changeOp: ChangeOperation<WorkflowTransition>;
        if (this.isStringOperation(op)) {
          const targetTransition = (this.content as Workflow).transitions.find(
            (transition) => transition.name === op.target,
          )!;
          changeOp = {
            name: 'change',
            target: targetTransition as WorkflowTransition,
            to: {
              name: op.to,
              toState: targetTransition.toState,
              fromState: targetTransition.fromState,
            },
          };
        } else {
          changeOp = op as ChangeOperation<WorkflowTransition>;
        }
        const newTransition = await this.transitionObject(changeOp);
        content.transitions = content.transitions.map((item) =>
          item.name == newTransition.name ? newTransition : item,
        );
      }

      if (key === 'states' && op.name === 'remove') {
        // If workflow state is removed, remove all transitions "to" and "from" this state.
        let removeOp: RemoveOperation<WorkflowState>;
        if (this.isStringOperation(op)) {
          const toBeRemovedState = this.content.states.find(
            (state) => state.name === op.target,
          );
          removeOp = {
            name: 'remove',
            target: toBeRemovedState as WorkflowState,
            replacementValue: (op as RemoveOperation<unknown>)
              .replacementValue as WorkflowState,
          };
        } else {
          removeOp = op as RemoveOperation<WorkflowState>;
        }
        await this.handleStateRemoval(content, removeOp);
      } else if (key === 'states' && op.name === 'change') {
        // If workflow state is renamed, replace all transitions "to" and "from" the old state with new state.
        let changeOp: ChangeOperation<WorkflowState>;
        if (this.isStringOperation(op)) {
          const toBeChangedState = this.content.states.find(
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
        await this.handleStateChange(content, changeOp);
      }

      await super.postUpdate(content, updateKey, op);
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
    const allCards = cards ?? super.cards();
    const cardTypes = this.project.resources.cardTypes();
    const cardTypeReferences = [];
    for (const cardType of cardTypes) {
      if (cardType.data?.workflow === resourceName) {
        cardTypeReferences.push(cardType.data.name);
      }
    }

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
}
