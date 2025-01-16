/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/
import { Dirent, readdirSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { CardContainer } from '../card-container.js';
import { pathExists, stripExtension } from '../../utils/file-utils.js';
import { resourceName } from '../../utils/resource-utils.js';
import { ProjectPaths } from './project-paths.js';
import {
  Resource,
  ResourceFolderType,
} from '../../interfaces/project-interfaces.js';

import { Project } from '../project.js';

/**
 * Defines where resources are collected from.
 * all - everywhere
 * importOnly - only from imported modules
 * localOnly - only from the project itself; excluding imported modules
 */
export enum ResourcesFrom {
  all = 'all',
  importedOnly = 'imported',
  localOnly = 'local',
}

/**
 * This class handles local and modules resources.
 */
export class ResourceCollector {
  private localCalculations: Resource[] = [];
  private localCardTypes: Resource[] = [];
  private localFieldTypes: Resource[] = [];
  private localLinkTypes: Resource[] = [];
  private localTemplates: Resource[] = [];
  private localWorkflows: Resource[] = [];
  private localReports: Resource[] = [];

  private paths: ProjectPaths;

  constructor(private project: Project) {
    this.paths = this.project.paths;
  }

  // Add resources of a given type to an array.
  private async addResources(
    resources: Dirent[],
    requestedType: ResourceFolderType,
  ): Promise<Resource[]> {
    const collectedResources: Resource[] = [];
    for (const resource of resources) {
      if (requestedType === 'modules') {
        collectedResources.push(...resources);
        break;
      } else {
        const resourcePath = join(
          this.paths.modulesFolder,
          resource.name,
          requestedType,
        );
        if (!pathExists(resourcePath)) {
          continue;
        }
        const files = (
          await readdir(resourcePath, { withFileTypes: true })
        ).filter(
          (item) =>
            item.isFile() &&
            item.name !== CardContainer.schemaContentFile &&
            item.name !== '.gitkeep',
        );

        files.forEach((item) => {
          item.name = `${resource.name}/${requestedType}/${stripExtension(item.name)}`;
          collectedResources.push({ name: item.name, path: item.parentPath });
        });
      }
    }
    return collectedResources;
  }

  // Adds a resource type from all modules.
  private async addResourcesFromModules(
    type: ResourceFolderType,
  ): Promise<Resource[]> {
    if (!pathExists(this.paths.modulesFolder)) {
      return [];
    }

    const moduleDirectories = await readdir(this.paths.modulesFolder, {
      withFileTypes: true,
    });
    const modules = moduleDirectories.filter((item) => item.isDirectory());

    return [...(await this.addResources(modules, type))];
  }

  // Joins local resources and module resources together to one array.
  private joinResources(
    from: ResourcesFrom,
    localCollection: Resource[],
    moduleCollection: Resource[],
  ) {
    if (from === ResourcesFrom.localOnly) {
      return localCollection;
    }
    if (from === ResourcesFrom.importedOnly) {
      return moduleCollection;
    }
    return [...localCollection, ...moduleCollection];
  }

  // Returns local resources of a given type.
  private localResources(type: ResourceFolderType) {
    if (type === 'calculations') {
      return this.localCalculations;
    } else if (type === 'cardTypes') {
      return this.localCardTypes;
    } else if (type === 'fieldTypes') {
      return this.localFieldTypes;
    } else if (type === 'linkTypes') {
      return this.localLinkTypes;
    } else if (type === 'modules') {
      return [];
    } else if (type === 'reports') {
      return this.localReports;
    } else if (type === 'templates') {
      return this.localTemplates;
    } else if (type === 'workflows') {
      return this.localWorkflows;
    }
    throw new Error('Incorrect resource type ' + type);
  }

  // Collects certain kinds of resources.
  private resourcesSync(type: ResourceFolderType): Resource[] {
    const resourceFolder = this.project.paths.resourcePath(type);
    const resources: Resource[] = [];
    if (!pathExists(resourceFolder)) {
      return [];
    }
    const entries = readdirSync(resourceFolder, { withFileTypes: true });
    resources.push(
      ...entries
        .filter((entry) => {
          return (
            entry.isFile() &&
            entry.name !== '.gitkeep' &&
            entry.name !== CardContainer.schemaContentFile
          );
        })
        .map((entry) => {
          if (entry.name.endsWith('.json')) {
            entry.name = stripExtension(entry.name);
          }
          return {
            name: `${this.project.projectPrefix}/${type}/${entry.name}`,
            path: entry.parentPath,
          };
        }),
    );

    return resources;
  }

  /**
   * Collects all local resources.
   */
  public collectLocalResources() {
    this.localCalculations = this.resourcesSync('calculations');
    this.localCardTypes = this.resourcesSync('cardTypes');
    this.localFieldTypes = this.resourcesSync('fieldTypes');
    this.localLinkTypes = this.resourcesSync('linkTypes');
    this.localReports = this.resourcesSync('reports');
    this.localTemplates = this.resourcesSync('templates');
    this.localWorkflows = this.resourcesSync('workflows');
  }

  /**
   * Collect specific resource from modules.
   * @param type Type of resource (e.g. 'templates').
   * @returns array of collected items.
   */
  public async collectResourcesFromModules(type: ResourceFolderType) {
    return (await this.addResourcesFromModules(type)).map((item) =>
      stripExtension(item.name),
    );
  }

  /**
   * Add a given 'resource' to the local resource arrays.
   * @param resource Resource to add.
   */
  public add(resource: Resource) {
    // Helper to avoid adding duplicate entries.
    function addItem(array: Resource[], item: Resource) {
      if (!array.includes(item)) {
        item.name = stripExtension(item.name);
        array.push(item);
      }
    }

    const { type } = resourceName(resource.name);
    switch (type) {
      case 'cardTypes':
        addItem(this.localCardTypes, resource);
        break;
      case 'fieldTypes':
        addItem(this.localFieldTypes, resource);
        break;
      case 'linkTypes':
        addItem(this.localLinkTypes, resource);
        break;
      case 'reports':
        addItem(this.localReports, resource);
        break;
      case 'templates':
        addItem(this.localTemplates, resource);
        break;
      case 'workflows':
        addItem(this.localWorkflows, resource);
        break;
      default: {
        throw new Error(`Resource type '${type}' not handled in 'addResource'`);
      }
    }
  }

  /**
   * Re-collects local resources.
   */
  public changed() {
    this.collectLocalResources();
  }

  /**
   * Re-collects imported module resources.
   */
  public async moduleImported() {
    const promises = [];
    promises.push(this.collectResourcesFromModules('calculations'));
    promises.push(this.collectResourcesFromModules('cardTypes'));
    promises.push(this.collectResourcesFromModules('fieldTypes'));
    promises.push(this.collectResourcesFromModules('linkTypes'));
    promises.push(this.collectResourcesFromModules('reports'));
    promises.push(this.collectResourcesFromModules('templates'));
    promises.push(this.collectResourcesFromModules('workflows'));
    Promise.all(promises);
  }

  /**
   * Removes a resource from Project.
   * @param resource Resource to remove.
   * @returns the modified array.
   */
  public remove(resource: Resource) {
    const { type } = resourceName(resource.name);
    let arrayToModify: Resource[] = [];
    switch (type) {
      case 'cardTypes':
        arrayToModify = this.localCardTypes;
        break;
      case 'fieldTypes':
        arrayToModify = this.localFieldTypes;
        break;
      case 'linkTypes':
        arrayToModify = this.localLinkTypes;
        break;
      case 'reports':
        arrayToModify = this.localReports;
        break;
      case 'templates':
        arrayToModify = this.localTemplates;
        break;
      case 'workflows':
        arrayToModify = this.localWorkflows;
        break;
      default: {
        throw new Error(
          `Resource type '${type}' not handled in 'removeResource'`,
        );
      }
    }
    arrayToModify = arrayToModify.filter((item) => item.name !== resource.name);
    this.collectLocalResources();
    return arrayToModify;
  }

  /**
   * Checks if resource of 'type' with 'name' exists.
   * @param type Type of resource (e.g. 'templates').
   * @param name Name of the resource.
   * @returns true, if resource exits, false otherwise.
   */
  public async resourceExists(
    type: ResourceFolderType,
    name: string,
  ): Promise<boolean> {
    if (!name) {
      return false;
    }
    return (await this.resources(type)).some((item) => item.name === name);
  }

  /**
   * Returns resources of 'type'. Returned resources are either local, or from modules or all of them.
   * @param type Type of resource (e.g. 'templates').
   * @param from Defines where resources are collected from.
   * @returns Array of resources.
   */
  public async resources(
    type: ResourceFolderType,
    from: ResourcesFrom = ResourcesFrom.all,
  ): Promise<Resource[]> {
    const moduleResources =
      from !== ResourcesFrom.localOnly
        ? await this.addResourcesFromModules(type)
        : [];

    const localResourcesOfType = this.localResources(type);
    return this.joinResources(from, localResourcesOfType, moduleResources);
  }
}
