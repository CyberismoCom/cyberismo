/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

// node
import { join } from 'node:path';

import { ResourceFolderType } from '../../interfaces/project-interfaces.js';

/**
 * Handles paths for a project.
 * todo: change calls from project.<methodToReturnFolder>  --> project.paths.<method>; then remove project methods
 */
export class ProjectPaths {
  private pathMap: Map<ResourceFolderType, string>;

  constructor(
    private path: string,
    private prefix: string,
  ) {
    this.pathMap = new Map([
      ['calculation', this.calculationProjectFolder],
      ['cardType', this.cardTypesFolder],
      ['fieldType', this.fieldTypesFolder],
      ['linkType', this.linkTypesFolder],
      ['module', this.modulesFolder],
      ['report', this.reportsFolder],
      ['template', this.templatesFolder],
      ['workflow', this.workflowsFolder],
    ]);
  }

  public get calculationProjectFolder(): string {
    return join(this.path, '.cards', 'local', 'calculations');
  }

  public get cardTypesFolder(): string {
    return join(this.path, '.cards', 'local', 'cardTypes');
  }

  public get fieldTypesFolder(): string {
    return join(this.path, '.cards', 'local', 'fieldTypes');
  }

  public get linkTypesFolder(): string {
    return join(this.path, '.cards', 'local', 'linkTypes');
  }

  public get modulesFolder(): string {
    return join(this.path, '.cards', 'modules');
  }

  public get reportsFolder(): string {
    return join(this.path, '.cards', 'reports');
  }

  public get templatesFolder(): string {
    return join(this.path, '.cards', 'local', 'templates');
  }

  public get workflowsFolder(): string {
    return join(this.path, '.cards', 'local', 'workflows');
  }

  /**
   *
   * @param resourceType
   * @param resourceName
   * @returns
   */
  public resourceFullName(
    resourceType: ResourceFolderType,
    resourceName: string,
  ): string {
    const nameParts = resourceName.split('/').length;
    if (nameParts === 2 || nameParts > 3) throw new Error('Invalid name');
    if (nameParts === 3) return resourceName;
    return `${this.prefix}/${resourceType}s/${resourceName}`;
  }

  /**
   * Return path to a resource type folder.
   * @param resourceType
   * @returns path to a resources folder (e.g. '.cards/local/cardTypes')
   */
  public resourcePath(resourceType: ResourceFolderType): string {
    const resourcePath = this.pathMap.get(resourceType);
    if (!resourcePath) {
      throw new Error(`unknown resourceType: ${resourceType}`);
    }
    return resourcePath;
  }
}
