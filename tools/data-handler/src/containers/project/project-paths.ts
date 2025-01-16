/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { join } from 'node:path';

import { ResourceFolderType } from '../../interfaces/project-interfaces.js';

/**
 * Handles paths for a project.
 */
export class ProjectPaths {
  private pathMap: Map<ResourceFolderType, string>;

  constructor(
    private path: string,
    private prefix: string,
  ) {
    this.pathMap = new Map([
      ['calculations', this.calculationProjectFolder],
      ['cardTypes', this.cardTypesFolder],
      ['fieldTypes', this.fieldTypesFolder],
      ['linkTypes', this.linkTypesFolder],
      ['modules', this.modulesFolder],
      ['reports', this.reportsFolder],
      ['templates', this.templatesFolder],
      ['workflows', this.workflowsFolder],
    ]);
  }

  public get calculationCardsFolder(): string {
    return join(this.calculationFolder, 'cards');
  }

  public get calculationFolder(): string {
    return join(this.path, '.calc');
  }

  public get calculationProjectFolder(): string {
    return join(this.resourcesFolder, 'calculations');
  }

  public get calculationResourcesFolder(): string {
    return join(this.calculationFolder, 'resources');
  }

  public get cardRootFolder(): string {
    return join(this.path, 'cardRoot');
  }

  public get cardTypesFolder(): string {
    return join(this.resourcesFolder, 'cardTypes');
  }

  public get fieldTypesFolder(): string {
    return join(this.resourcesFolder, 'fieldTypes');
  }

  public get linkTypesFolder(): string {
    return join(this.resourcesFolder, 'linkTypes');
  }
  public get logPath(): string {
    return join(this.path, '.cards', 'local', 'dh.log');
  }

  public get modulesFolder(): string {
    return join(this.path, '.cards', 'modules');
  }

  public get resourcesFolder(): string {
    return join(this.path, '.cards', 'local');
  }

  public get reportsFolder(): string {
    return join(this.resourcesFolder, 'reports');
  }

  public get tempCardFolder(): string {
    return join(this.tempFolder, 'cards');
  }

  public get tempFolder(): string {
    return join(this.path, '.temp');
  }

  public get templatesFolder(): string {
    return join(this.resourcesFolder, 'templates');
  }

  public get workflowsFolder(): string {
    return join(this.resourcesFolder, 'workflows');
  }

  /**
   * Return path to a resource type folder.
   * @param resourceType Type of resource
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
