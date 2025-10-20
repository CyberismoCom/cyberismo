/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2025

  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import {
  ResourceCache,
  ResourcesFrom,
  type ResourceMap,
} from './resource-cache.js';
import { resourceName } from '../../utils/resource-utils.js';
import type { Project } from '../project.js';
import type { ResourceFolderType } from '../../interfaces/project-interfaces.js';
import type { ResourceName } from '../../utils/resource-utils.js';

// Convert singular forms to plural. Uses real type, so cannot be general.
export const singularToPluralResourceType: Record<string, keyof ResourceMap> = {
  template: 'templates',
  workflow: 'workflows',
  report: 'reports',
  calculation: 'calculations',
  cardType: 'cardTypes',
  fieldType: 'fieldTypes',
  graphModel: 'graphModels',
  graphView: 'graphViews',
  linkType: 'linkTypes',
};

/**
 * ResourceHandler manages resource access for a project.
 * It owns the ResourceCache and provides APIs for accessing resources.
 */
export class ResourceHandler {
  private cache: ResourceCache;

  /**
   * Creates instance of ResourceHandler.
   * @param project Project to use in cache
   */
  constructor(project: Project) {
    this.cache = ResourceCache.create(project);
  }

  /**
   * Add a resource to the cache.
   * @param name Name of the resource to add
   * @param instance Resource instance
   */
  public add(name: string | ResourceName, instance: unknown): void {
    this.cache.addResource(name, instance);
  }

  public byType<T extends keyof ResourceMap>(
    name: string,
    type: T,
  ): ResourceMap[T];

  /**
   * Overload to the above: Accept resource name
   * @param resourceName Name of resource as a resource name (prefix/type/identifier)
   * @template T Resource type
   * @returns resource with inferred actual type.
   */
  public byType<T extends keyof ResourceMap>(
    resourceName: ResourceName,
  ): ResourceMap[T];

  /**
   * Returns type of resource.
   * @param nameOrResourceName Name of resource
   * @param type Name of resource as string matching Resource map element.
   * @template T Resource type as part of ResourceMap
   * @returns resource with inferred actual type.
   */
  public byType<T extends keyof ResourceMap>(
    nameOrResourceName: string | ResourceName,
    type?: T,
  ): ResourceMap[T] {
    if (typeof nameOrResourceName === 'string') {
      if (!type) {
        throw new Error('Type parameter required when using string name');
      }
      return this.cache.resourceByType(nameOrResourceName, type);
    } else {
      return this.cache.resourceByName(nameOrResourceName);
    }
  }

  /**
   * Get resource by ResourceName object.
   * @param name Resource name
   * @template T Resource type
   * @returns Typed resource that matches the name
   */
  public byName<T extends keyof ResourceMap>(
    name: ResourceName,
  ): ResourceMap[T] {
    return this.cache.resourceByName(name);
  }

  /**
   * Refresh local resources in the cache.
   */
  public changed(): void {
    this.cache.changed();
  }

  /**
   * Refresh module resources in the cache.
   * @param moduleName Name of the module. If given, will only update this module's resources.
   */
  public changedModules(moduleName?: string): void {
    this.cache.changedModules(moduleName);
  }

  /**
   * Check if a resource exists.
   * @param name Resource name to check
   * @returns true if resource exists, false otherwise
   */
  public exists(name: string | ResourceName): boolean {
    return this.cache.has(name);
  }

  /**
   * Get module names.
   * @returns Array of module names
   */
  public moduleNames(): string[] {
    return this.cache.moduleNames();
  }

  /**
   * Get certain types of resources from a specific module.
   * @param type Type of resource to fetch
   * @param moduleName Name of the module
   * @returns Resource names from a specific module
   */
  public moduleResourceNames(
    type: ResourceFolderType,
    moduleName: string,
  ): string[] {
    return this.cache.moduleResourceNames(type, moduleName);
  }

  /**
   * Remove a resource from cache.
   * @param name Resource to remove
   */
  public remove(name: string | ResourceName): void {
    this.cache.removeResource(name);
  }

  /**
   * Removes all resources from a specific module.
   * @param moduleName Name of the module
   */
  public removeModule(moduleName: string): void {
    this.cache.removeModule(moduleName);
  }

  /**
   * Change resource name in cache, but keep instance information.
   * @param oldName Old name of the resource
   * @param newName New name of the resource
   */
  public rename(oldName: string, newName: string): void {
    this.cache.changeResourceName(oldName, newName);
  }

  /**
   * Get resources of a specific type.
   * @param type Type of resources to get
   * @param from Where to return resources from (all, local, imported modules)
   * @template T Resource type
   * @returns Array of resources
   */
  public resourceTypes<T extends keyof ResourceMap>(
    type: T,
    from: ResourcesFrom = ResourcesFrom.all,
  ): Array<ResourceMap[T]> {
    return this.cache.resources(type, from);
  }

  // The following are just helpers to get specific resource types
  public calculations(from: ResourcesFrom = ResourcesFrom.all) {
    return this.cache.resources('calculations', from);
  }

  public cardTypes(from: ResourcesFrom = ResourcesFrom.all) {
    return this.cache.resources('cardTypes', from);
  }

  public fieldTypes(from: ResourcesFrom = ResourcesFrom.all) {
    return this.cache.resources('fieldTypes', from);
  }

  public graphViews(from: ResourcesFrom = ResourcesFrom.all) {
    return this.cache.resources('graphViews', from);
  }

  public graphModels(from: ResourcesFrom = ResourcesFrom.all) {
    return this.cache.resources('graphModels', from);
  }

  public linkTypes(from: ResourcesFrom = ResourcesFrom.all) {
    return this.cache.resources('linkTypes', from);
  }

  public reports(from: ResourcesFrom = ResourcesFrom.all) {
    return this.cache.resources('reports', from);
  }

  public templates(from: ResourcesFrom = ResourcesFrom.all) {
    return this.cache.resources('templates', from);
  }

  public workflows(from: ResourcesFrom = ResourcesFrom.all) {
    return this.cache.resources('workflows', from);
  }

  /**
   * Extract resource type from a resource name string.
   * @param name Resource name
   * @returns Resource type
   * @throws when resource type is invalid
   */
  public extractType(name: string): keyof ResourceMap {
    const type = resourceName(name).type;
    if (!type) {
      throw new Error(`Invalid resource type: ${type}`);
    }
    return type as keyof ResourceMap;
  }

  /**
   * Handle file system changes.
   * @param fileName A changed file in the file system
   */
  public handleFileSystemChange(fileName: string): void {
    this.cache.handleFileSystemChange(fileName);
  }

  /**
   * Get plural resource type name from singular type name.
   * @param singular Resource type as singular name
   * @returns Resource type as plural name
   */
  public resourceTypeFromSingularType(singular: string): keyof ResourceMap {
    const plural = singularToPluralResourceType[singular];
    if (!plural) {
      throw new Error(`Unknown singular resource type: ${singular}`);
    }
    return plural;
  }
}
