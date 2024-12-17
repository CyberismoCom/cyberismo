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
  FileResources,
  Workflow,
  WorkflowState,
  WorkflowTransition,
} from '../interfaces/resource-interfaces.js';
import { CardTypeResource } from './card-type-resource.js';
import { DefaultContent } from '../create-defaults.js';
import { FileResource } from './file-resource.js';
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

  // Update dependant card types.
  private async updateCardTypes(oldName: string) {
    const cardTypes = await this.project.cardTypes(ResourcesFrom.localOnly);
    for (const cardType of cardTypes) {
      const object = new CardTypeResource(
        this.project,
        resourceName(cardType.name),
      );
      if (object.data && (object.data as CardType).workflow === oldName) {
        await object.update('workflow', this.content.name);
      }
    }
  }

  /**
   * Sets new metadata into the workflow object.
   * @param newContent metadata content for the workflow.
   */
  public async create(newContent?: FileResources) {
    if (!newContent) {
      newContent = DefaultContent.workflowContent(
        resourceNameToString(this.resourceName),
      );
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
    const oldName = this.content.name;
    await super.rename(newName);
    return this.updateCardTypes(oldName);
  }

  /**
   * Shows metadata of the resource.
   * @returns workflow metadata.
   */
  public async show(): Promise<Workflow> {
    return super.show() as unknown as Workflow;
  }

  /**
   * Updates workflow resource.
   * @param key Key to modify
   * @param value New value.
   * @throws if key is unknown.
   */
  public async update<Type>(key: string, value: Type) {
    const nameChange = key === 'name';
    const existingName = this.content.name;
    await super.update(key, value);

    const workflowContent = this.data as unknown as Workflow;
    if (key === 'name') {
      workflowContent.name = value as string;
    } else if (key === 'states') {
      workflowContent.states = value as WorkflowState[];
    } else if (key === 'transitions') {
      workflowContent.transitions = value as WorkflowTransition[];
    } else {
      throw new Error(`Unknown property '${key}' for Workflow`);
    }

    await super.postUpdate(workflowContent, key, value);

    // After this resource has been updated, update the dependents.
    if (nameChange) {
      await this.updateCardTypes(existingName);
    }
  }

  /**
   * Validates workflow.
   * @throws when there are validation errors.
   */
  public validate(): Promise<void> {
    return super.validate();
  }
}
