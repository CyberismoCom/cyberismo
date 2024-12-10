/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { Project, ResourcesFrom } from './containers/project.js';
import { Validate } from './validate.js';
import {
  resourceNameParts,
  resourceNameToString,
  ResourceName,
} from './utils/resource-utils.js';
import {
  CardType,
  FieldType,
  LinkType,
  Workflow,
} from './interfaces/resource-interfaces.js';

/**
 * Class that handles 'update' commands.
 */
export class Update {
  constructor(private project: Project) {}

  // Does the actual change to a value.
  private async doUpdateResource(
    resourceName: ResourceName,
    key: string,
    value: unknown,
  ) {
    const resource = await this.resource(resourceName);
    if (resource && resource.name) {
      if (key === 'name') {
        resource.name = value as string;
      } else if (key === 'workflow') {
        (resource as CardType).workflow = value as string;
      } else {
        throw new Error(
          `Changing property '${key}' to value '${value}' is not supported `,
        );
      }
      await this.project.updateResource(
        `${resourceName.prefix}/${resourceName.type}/${resourceName.identifier}`,
        resource,
        key === 'name' ? resource.name : undefined,
      );
    }
  }

  // Fetches a resource object that matches the name.
  private async resource(
    resourceName: ResourceName,
  ): Promise<CardType | FieldType | LinkType | Workflow | undefined> {
    let resource;
    if (resourceName.type === 'workflows') {
      resource = await this.project.workflow(
        resourceNameToString(resourceName),
      );
    }
    if (resourceName.type === 'cardTypes') {
      resource = await this.project.cardType(
        resourceNameToString(resourceName),
      );
    }
    if (resourceName.type === 'fieldTypes') {
      resource = await this.project.fieldType(
        resourceNameToString(resourceName),
      );
    }
    if (resourceName.type === 'linkTypes') {
      resource = await this.project.linkType(
        resourceNameToString(resourceName),
      );
    }
    return resource;
  }

  // Updates all card types to use renamed workflow.
  private async updateCardTypes(
    oldWorkflowName: string,
    newWorkflowName: string,
  ) {
    const cardTypes = await this.project.cardTypes(ResourcesFrom.localOnly);
    for (const cardType of cardTypes) {
      const cardTypeObject = await this.project.cardType(cardType.name);
      if (cardTypeObject && cardTypeObject.workflow === oldWorkflowName) {
        await this.doUpdateResource(
          resourceNameParts(cardType.name),
          'workflow',
          newWorkflowName,
        );
      }
    }
  }

  /**
   * Updates single resource property.
   * @param resourceName Name of the resource
   * @param key Property to change in resource JSON
   * @param value New value for 'key'
   */
  public async updateValue(resourceName: string, key: string, value: unknown) {
    const name = resourceNameParts(resourceName);

    if (key === 'name') {
      const newName = resourceNameParts(value as string);
      if (!Validate.isValidResourceName(newName.identifier)) {
        throw new Error(`Cannot change the name of the resource to '${value}'`);
      }
      if (name.type !== newName.type) {
        throw new Error(`Resource name must contain type '${name.type}'`);
      }
    }

    await this.doUpdateResource(name, key, value);

    // If workflow was renamed, update all cardTypes that use that workflow
    if (name.type === 'workflows' && key === 'name') {
      await this.updateCardTypes(resourceName, value as string);
    }

    this.project.collectLocalResources();
  }
}
