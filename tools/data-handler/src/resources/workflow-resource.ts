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
   *
   * The cross-resource cascade (handlebar / calculation / card-content
   * reference rewrites) lives in `WorkflowRenameHandler.apply`, which calls
   * the cascade helpers before invoking this method so the old name is
   * still findable on disk. This override therefore just delegates to the
   * base class and persists the new in-memory name to disk.
   * @param newName New name for the resource.
   */
  public async rename(newName: ResourceName) {
    await super.rename(newName);
    await this.write();
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

    if (this.isBaseProperty(key)) {
      await super.update(updateKey, op);
      return;
    }

    const content = structuredClone(this.content) as Workflow;

    if (key === 'states' && op.name === 'change') {
      const changeOp = op as ChangeOperation<WorkflowState>;
      if (
        changeOp.to.name === undefined ||
        changeOp.to.category === undefined
      ) {
        throw new Error(
          `Cannot change state '${this.targetName(changeOp)}' for workflow '${this.content.name}'.
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

      if (op.name === 'change') {
        // Existing transition-validation path; keep transitionObject and
        // re-apply the validated change.
        let changeOp: ChangeOperation<WorkflowTransition>;
        if (this.isStringOperation(op)) {
          const targetTransition = (this.content as Workflow).transitions.find(
            (t) => t.name === op.target,
          )!;
          changeOp = {
            name: 'change',
            target: targetTransition,
            to: {
              name: op.to as unknown as string,
              toState: targetTransition.toState,
              fromState: targetTransition.fromState,
            },
          };
        } else {
          changeOp = op as ChangeOperation<WorkflowTransition>;
        }
        const newTransition = await this.transitionObject(changeOp);
        content.transitions = content.transitions.map((t) =>
          t.name === newTransition.name ? newTransition : t,
        );
      }
    } else {
      throw new Error(`Unknown property '${key}' for Workflow`);
    }

    await super.postUpdate(content, updateKey, op);
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
