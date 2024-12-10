/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/
import { Dirent, readdirSync } from 'node:fs';
import { readdir, rename } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { CardContainer } from '../card-container.js';
import { readJsonFile, writeJsonFile } from '../../utils/json.js';
import { pathExists, stripExtension } from '../../utils/file-utils.js';
import {
  resourceNameParts,
  resourceNameToString,
} from '../../utils/resource-utils.js';
import { ProjectPaths } from './project-paths.js';
import {
  Resource,
  ResourceFolderType,
} from '../../interfaces/project-interfaces.js';

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

  constructor(
    private prefix: string,
    private paths: ProjectPaths,
  ) {}

  // Add resources of a given type to an array.
  private async addResources(
    resources: Dirent[],
    requestedType: string, // should be a type
  ): Promise<Resource[]> {
    const collectedResources: Resource[] = [];
    const filteredDirectories =
      requestedType === 'templates' || requestedType === 'reports'
        ? true
        : false;
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
        const files = await readdir(resourcePath, { withFileTypes: true });
        const filteredFiles = filteredDirectories
          ? files.filter((item) => item.isDirectory())
          : files.filter(
              (item) =>
                item.name !== CardContainer.schemaContentFile &&
                item.name !== '.gitkeep',
            );

        filteredFiles.forEach((item) => {
          item.name = `${resource.name}/${requestedType}/${item.name}`;
          collectedResources.push({ name: item.name, path: item.parentPath });
        });
      }
    }
    return collectedResources;
  }

  // Adds a resource type from all modules.
  private async addResourcesFromModules(type: string): Promise<Resource[]> {
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
  private localResources(type: string) {
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
  private resourcesSync(
    type: ResourceFolderType,
    requirement: string,
  ): Resource[] {
    // todo: this type of mapping should exist somewhere else. Resource utils?
    let resourceFolder: string;
    if (type === 'calculation') {
      resourceFolder = this.paths.calculationProjectFolder;
    } else if (type === 'cardType') {
      resourceFolder = this.paths.cardTypesFolder;
    } else if (type === 'fieldType') {
      resourceFolder = this.paths.fieldTypesFolder;
    } else if (type === 'linkType') {
      resourceFolder = this.paths.linkTypesFolder;
    } else if (type === 'template') {
      resourceFolder = this.paths.templatesFolder;
    } else if (type === 'workflow') {
      resourceFolder = this.paths.workflowsFolder;
    } else if (type === 'report') {
      resourceFolder = this.paths.reportsFolder;
    } else {
      return [];
    }

    const resources: Resource[] = [];
    if (!pathExists(resourceFolder)) {
      return [];
    }
    const entries = readdirSync(resourceFolder, { withFileTypes: true });
    resources.push(
      ...entries
        .filter((entry) => {
          return !(
            entry.isFile() && entry.name === CardContainer.schemaContentFile
          );
        })
        .filter((entry) => {
          return !(entry.isFile() && entry.name === '.gitkeep');
        })
        .filter((entry) => {
          return requirement === 'folder'
            ? entry.isDirectory()
            : requirement === 'file'
              ? entry.isFile()
              : false;
        })
        .map((entry) => {
          return {
            name: `${this.prefix}/${type}s/${entry.name}`,
            path: entry.parentPath,
          };
        }),
    );

    return resources;
  }

  /**
   * Add a given 'resource' to the local resource arrays.
   * @param resource Resource to add.
   */
  public add(resource: Resource) {
    // Helper to avoid adding duplicate entries.
    function addItem(array: Resource[], item: Resource) {
      if (!array.includes(item)) {
        array.push(item);
      }
    }

    const { type } = resourceNameParts(resource.name);
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
   * Collects all local resources.
   */
  public collectLocalResources() {
    this.localCalculations = this.resourcesSync('calculation', 'file');
    this.localCardTypes = this.resourcesSync('cardType', 'file');
    this.localFieldTypes = this.resourcesSync('fieldType', 'file');
    this.localLinkTypes = this.resourcesSync('linkType', 'file');
    this.localReports = this.resourcesSync('report', 'folder');
    this.localTemplates = this.resourcesSync('template', 'folder');
    this.localWorkflows = this.resourcesSync('workflow', 'file');
  }

  /**
   * Collect specific resource from modules.
   * @param type Type of resource (e.g. 'templates').
   * @returns array of collected items.
   */
  public async collectResourcesFromModules(type: string) {
    return (await this.addResourcesFromModules(type)).map((item) =>
      stripExtension(item.name),
    );
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
   */
  public remove(resource: Resource) {
    const { type } = resourceNameParts(resource.name);
    let arrayToModify: Resource[];
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
    const index = arrayToModify.indexOf(resource, 0);
    if (index > -1) {
      arrayToModify.splice(index, 1);
    }
  }

  /**
   * Returns resource's metadata.
   * @param type Type of resource (e.g. 'templates').
   * @param name Name of the resource.
   * @param from Defines where resources are collected from.
   * @returns Resources metadata, or undefined if resource was not found.
   * @note that caller need to convert this to specific type (e.g "as unknown as Workflow")
   */
  public async resource(
    type: string,
    name: string,
    from: ResourcesFrom,
  ): Promise<object | undefined> {
    if (!name) {
      return undefined;
    }
    if (!name.endsWith('.json')) {
      name += '.json';
    }
    const found = (await this.resources(type, from)).find(
      (item) => item.name === name && item.path,
    );
    if (!found || !found.path) {
      return undefined;
    }
    return readJsonFile(join(found.path, basename(found.name)));
  }

  /**
   * Checks if resource of 'type' with 'name' exists.
   * @param type Type of resource (e.g. 'templates').
   * @param name Name of the resource.
   * @returns true, if resource exits, false otherwise.
   */
  public async resourceExists(type: string, name: string): Promise<boolean> {
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
    type: string,
    from: ResourcesFrom = ResourcesFrom.all,
  ): Promise<Resource[]> {
    const moduleResources =
      from !== ResourcesFrom.localOnly
        ? await this.addResourcesFromModules(type)
        : [];

    const localResourcesOfType = this.localResources(type);
    return this.joinResources(from, localResourcesOfType, moduleResources);
  }

  /**
   * Saves a resource with new content. If newFileName is provided, renames the file.
   * @param resourceName Name of the resource.
   * @param newContent New content for the resource. todo: how to do folder based resources?
   * @param newFileName new name for the resource file.
   */
  public async saveResource(
    resourceName: string,
    newContent: JSON,
    newFileName?: string,
  ) {
    const resource = resourceNameParts(resourceName);
    const fullName = resourceNameToString(resource);

    const found = (await this.resources(resource.type)).find(
      (item) => item.name === fullName + '.json',
    );
    if (!found) {
      throw new Error(`Resource '${fullName}' not found from the project`);
    }

    let jsonContentFile = join(found.path, resource.identifier + '.json');
    if (!pathExists(jsonContentFile)) {
      throw new Error(`Resource '${fullName}'does not exists`);
    }

    // Either it is update, or update-and-rename operation.
    if (newFileName) {
      const newFilenamePath = join(
        found.path,
        resourceNameParts(newFileName).identifier + '.json',
      );
      await rename(jsonContentFile, newFilenamePath);
      jsonContentFile = newFilenamePath;
    }
    await writeJsonFile(jsonContentFile, newContent, { flag: 'w' });
  }
}
