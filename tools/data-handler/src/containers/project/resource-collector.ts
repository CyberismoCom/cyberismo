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

import { type Dirent, readdirSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { extname, join } from 'node:path';

import type { Project } from '../project.js';
import type { ProjectPaths } from './project-paths.js';
import type {
  Resource,
  ResourceFolderType,
} from '../../interfaces/project-interfaces.js';
import { resourceName } from '../../utils/resource-utils.js';
import { stripExtension } from '../../utils/file-utils.js';

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

// This class collects resources that have these types of files.
const allowedExtensions = ['.lp', '.json'];

// Helper class to contain collected resources.
class ResourceCollection {
  public calculations: Resource[] = [];
  public cardTypes: Resource[] = [];
  public fieldTypes: Resource[] = [];
  public graphModels: Resource[] = [];
  public graphViews: Resource[] = [];
  public linkTypes: Resource[] = [];
  public reports: Resource[] = [];
  public templates: Resource[] = [];
  public workflows: Resource[] = [];

  /**
   * Returns resource array of a give type.
   * @param type Resource array type to return.
   * @returns resource array of a give type.
   */
  public resourceArray(
    type: ResourceFolderType,
    moduleName?: string,
  ): Resource[] {
    let resources: Resource[] = [];

    if (type === 'calculations') resources = this.calculations;
    else if (type === 'cardTypes') resources = this.cardTypes;
    else if (type === 'fieldTypes') resources = this.fieldTypes;
    else if (type === 'graphViews') resources = this.graphViews;
    else if (type === 'graphModels') resources = this.graphModels;
    else if (type === 'linkTypes') resources = this.linkTypes;
    else if (type === 'reports') resources = this.reports;
    else if (type === 'templates') resources = this.templates;
    else if (type === 'workflows') resources = this.workflows;
    else throw new Error(`Unknown resource type '${type}'`);

    if (moduleName) {
      resources = resources.filter((item) => {
        const { prefix } = resourceName(item.name);
        return moduleName === prefix;
      });
    }

    return resources;
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
      item.isFile() && allowedExtensions.includes(extname(item.name));

    const processResource = async (resource: Dirent): Promise<Resource[]> => {
      const resourcePath = join(
        this.paths.modulesFolder,
        resource.name,
        requestedType,
      );

      try {
        const files = await readdir(resourcePath, { withFileTypes: true });
        return files.filter(isValidFile).map((item) => ({
          name: `${resource.name}/${requestedType}/${stripExtension(item.name)}`,
          path: item.parentPath,
        }));
      } catch {
        return [];
      }
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
      this.modules.graphModels = [
        ...(await this.addResources(modules, 'graphModels')),
      ];
      this.modules.graphViews = [
        ...(await this.addResources(modules, 'graphViews')),
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
    moduleName?: string,
  ): Promise<Resource[]> {
    try {
      // 'modules' is a bit special; it is collected separately from actual resources.
      if (type === 'modules') {
        const moduleDirectories = await readdir(this.paths.modulesFolder, {
          withFileTypes: true,
        });
        const modules = moduleDirectories.filter((item) => item.isDirectory());
        return [...(await this.addResources(modules, 'modules'))];
      }

      await this.addModuleResources();
      return this.modules.resourceArray(type, moduleName);
    } catch {
      return [];
    }
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
    let entries = [];
    try {
      entries = readdirSync(resourceFolder, { withFileTypes: true });
    } catch {
      return [];
    }
    resources.push(
      ...entries
        .filter(
          (entry) =>
            entry.isFile() && allowedExtensions.includes(extname(entry.name)),
        )
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
      'graphModels',
      'graphViews',
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
   * @param moduleName Name of the module to collect resources from
   * @returns array of collected items.
   */
  public async collectResourcesFromModules(
    type: ResourceFolderType,
    moduleName?: string,
  ) {
    return (await this.addResourcesFromModules(type, moduleName)).map((item) =>
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
      case 'graphModels':
        addItem(this.local.graphModels, resource);
        break;
      case 'graphViews':
        addItem(this.local.graphViews, resource);
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
