/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import {
  CardType,
  Workflow,
  WorkflowState,
  WorkflowTransition,
} from '../interfaces/resource-interfaces.js';
import { CardTypeResource } from './card-type-resource.js';
import { DefaultContent } from '../create-defaults.js';
import { ChangeOperation, FileResource, Operation } from './file-resource.js';
import { Project, ResourcesFrom } from '../containers/project.js';
import {
  ResourceName,
  resourceName,
  resourceNameToString,
} from '../utils/resource-utils.js';

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

  // When resource name changes.
  private async handleNameChange(existingName: string) {
    await Promise.all([
      this.updateCardTypes(existingName),
      super.updateHandleBars(existingName, this.content.name),
      super.updateCalculations(existingName, this.content.name),
    ]);
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
      newContent = DefaultContent.workflowContent(
        resourceNameToString(this.resourceName),
      );
    } else {
      await this.validate(newContent);
    }
    return super.create(newContent);
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

    await super.postUpdate(content, key, op);

    // Renaming this workflow causes that references to its name must be updated.
    if (nameChange) {
      await this.handleNameChange(existingName);
    }
  }

  /**
   * Validates workflow.
   * @throws when there are validation errors.
   */
  public validate(content?: object): Promise<void> {
    return super.validate(content);
  }
}
