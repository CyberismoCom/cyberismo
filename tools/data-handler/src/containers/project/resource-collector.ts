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

// Helper class to contain collected resources.
class ResourceCollection {
  public calculations: Resource[] = [];
  public cardTypes: Resource[] = [];
  public fieldTypes: Resource[] = [];
  public linkTypes: Resource[] = [];
  public reports: Resource[] = [];
  public templates: Resource[] = [];
  public workflows: Resource[] = [];

  /**
   * Returns resource array of a give type.
   * @param type Resource array type to return.
   * @returns resource array of a give type.
   */
  public resourceArray(type: ResourceFolderType): Resource[] {
    if (type === 'calculations') return this.calculations;
    if (type === 'cardTypes') return this.cardTypes;
    if (type === 'fieldTypes') return this.fieldTypes;
    if (type === 'linkTypes') return this.linkTypes;
    if (type === 'reports') return this.reports;
    if (type === 'templates') return this.templates;
    if (type === 'workflows') return this.workflows;
    throw new Error(`Unknown resource type '${type}'`);
  }
}

/**
 * This class handles local and modules resources.
 */
export class ResourceCollector {
  private local: ResourceCollection = new ResourceCollection();
  private modules: ResourceCollection = new ResourceCollection();
  private modulesCollected: boolean = false;
  private paths: ProjectPaths;

  constructor(private project: Project) {
    this.paths = this.project.paths;
  }

  // Add resources of a given type to an array.
  private async addResources(
    resources: Dirent[],
    requestedType: ResourceFolderType,
  ): Promise<Resource[]> {
    if (requestedType === 'modules') {
      return resources.map((resource) => ({
        name: resource.name,
        path: resource.parentPath,
      }));
    }

    const isValidFile = (item: Dirent): boolean =>
      item.isFile() &&
      item.name !== CardContainer.schemaContentFile &&
      item.name !== '.gitkeep';

    const processResource = async (resource: Dirent): Promise<Resource[]> => {
      const resourcePath = join(
        this.paths.modulesFolder,
        resource.name,
        requestedType,
      );

      if (!pathExists(resourcePath)) {
        return [];
      }

      const files = await readdir(resourcePath, { withFileTypes: true });
      return files.filter(isValidFile).map((item) => ({
        name: `${resource.name}/${requestedType}/${stripExtension(item.name)}`,
        path: item.parentPath,
      }));
    };

    const results = await Promise.all(resources.map(processResource));

    return results.flat();
  }

  // Collects all module resources.
  private async addModuleResources() {
    if (!this.modulesCollected) {
      const moduleDirectories = await readdir(this.paths.modulesFolder, {
        withFileTypes: true,
      });
      const modules = moduleDirectories.filter((item) => item.isDirectory());

      this.modules.calculations = [
        ...(await this.addResources(modules, 'calculations')),
      ];
      this.modules.cardTypes = [
        ...(await this.addResources(modules, 'cardTypes')),
      ];
      this.modules.fieldTypes = [
        ...(await this.addResources(modules, 'fieldTypes')),
      ];
      this.modules.linkTypes = [
        ...(await this.addResources(modules, 'linkTypes')),
      ];
      this.modules.reports = [...(await this.addResources(modules, 'reports'))];
      this.modules.templates = [
        ...(await this.addResources(modules, 'templates')),
      ];
      this.modules.workflows = [
        ...(await this.addResources(modules, 'workflows')),
      ];
      this.modulesCollected = true;
    }
  }

  // Adds a resource type from all modules.
  private async addResourcesFromModules(
    type: ResourceFolderType,
  ): Promise<Resource[]> {
    if (!pathExists(this.paths.modulesFolder)) {
      return [];
    }
    // 'modules' is a bit special; it is collected separately from actual resources.
    if (type === 'modules') {
      const moduleDirectories = await readdir(this.paths.modulesFolder, {
        withFileTypes: true,
      });
      const modules = moduleDirectories.filter((item) => item.isDirectory());
      return [...(await this.addResources(modules, 'modules'))];
    }

    await this.addModuleResources();
    return this.modules.resourceArray(type);
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
    if (type === 'modules') {
      return [];
    } else {
      return this.local.resourceArray(type);
    }
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
    const resourceTypes = [
      'calculations',
      'cardTypes',
      'fieldTypes',
      'linkTypes',
      'reports',
      'templates',
      'workflows',
    ] as const;

    resourceTypes.forEach((type) => {
      this.local[type] = this.resourcesSync(type);
    });
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
        addItem(this.local.cardTypes, resource);
        break;
      case 'fieldTypes':
        addItem(this.local.fieldTypes, resource);
        break;
      case 'linkTypes':
        addItem(this.local.linkTypes, resource);
        break;
      case 'reports':
        addItem(this.local.reports, resource);
        break;
      case 'templates':
        addItem(this.local.templates, resource);
        break;
      case 'workflows':
        addItem(this.local.workflows, resource);
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
    this.modulesCollected = false;
  }

  /**
   * Removes a resource from Project.
   * @param resource Resource to remove.
   * @returns the modified array.
   */
  public remove(resource: Resource) {
    const { type } = resourceName(resource.name);
    const arrayToModify = this.local
      .resourceArray(type as ResourceFolderType)
      .filter((item) => item.name !== resource.name);
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
