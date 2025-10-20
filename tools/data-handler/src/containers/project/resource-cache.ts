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

import { dirname, extname, join } from 'node:path';
import { readdirSync } from 'node:fs';

import { getChildLogger } from '../../utils/log-utils.js';
import {
  pathToResourceName,
  resourceName,
  resourceNameToString,
} from '../../utils/resource-utils.js';
import { stripExtension } from '../../utils/file-utils.js';

import type { CalculationResource } from '../../resources/calculation-resource.js';
import type { CardTypeResource } from '../../resources/card-type-resource.js';
import type { FieldTypeResource } from '../../resources/field-type-resource.js';
import type { GraphModelResource } from '../../resources/graph-model-resource.js';
import type { GraphViewResource } from '../../resources/graph-view-resource.js';
import type { LinkTypeResource } from '../../resources/link-type-resource.js';
import type { Project } from '../project.js';
import type { ReportResource } from '../../resources/report-resource.js';
import type { ResourceFolderType } from '../../interfaces/project-interfaces.js';
import type { ResourceName } from '../../utils/resource-utils.js';
import type { TemplateResource } from '../../resources/template-resource.js';
import type { WorkflowResource } from '../../resources/workflow-resource.js';

// Project resource, such as workflow, template or card type as file system object.
// @todo: Once template constructor has been fixed, no need to export this.
export interface Resource {
  name: string;
  path: string;
}

// Resource type mappings
export type ResourceMap = {
  calculations: CalculationResource;
  cardTypes: CardTypeResource;
  fieldTypes: FieldTypeResource;
  graphViews: GraphViewResource;
  graphModels: GraphModelResource;
  linkTypes: LinkTypeResource;
  reports: ReportResource;
  templates: TemplateResource;
  workflows: WorkflowResource;
};

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

// Helper for SafeExtract.
export type ExtractResourceType<T extends string> =
  T extends `${string}/${infer R}/${string}` ? R : never;

// If type is correct, this always infers type correctly.
export type SafeExtract<T extends string> =
  ExtractResourceType<T> extends keyof ResourceMap
    ? ExtractResourceType<T>
    : never;

// Defines where resources are collected from.
export enum ResourcesFrom {
  all = 'all',
  importedOnly = 'imported',
  localOnly = 'local',
}

// Resource as stored in the instance cache.
interface ResourceMetadata {
  name: string;
  type: ResourceFolderType;
  path: string;
  source: 'local' | 'module';
  moduleName?: string;
}

// Allowed files in resource instance data.
const allowedExtensions = ['.lp', '.json'];

// Factory function type for creating resource instances
type ResourceFactory = (
  project: Project,
  resourceName: ResourceName,
) => unknown;

/**
 * ResourceCache handles all resource collecting, caching, and management.
 * Uses a two-layered approach:
 *  1. lightweight registry for collecting items that exist on disk
 *  2. more complex instance cache that contains full instance data of a resource.
 */
export class ResourceCache {
  private resourceRegistry = new Map<string, ResourceMetadata>();
  private instanceCache = new Map<string, unknown>();

  private project: Project;
  private resourceFactory: ResourceFactory;

  constructor(project: Project, resourceFactory: ResourceFactory) {
    this.project = project;
    this.resourceFactory = resourceFactory;
  }

  // Build a full resource name from partial name and type.
  private buildResourceName(name: string, type?: string): ResourceName {
    if (type && name && name.split('/').length === 1) {
      name = `${this.project.projectPrefix}/${type}/${name}`;
    }
    return resourceName(name);
  }

  // Create a resource object instance using the injected factory
  private createResourceObject(resourceName: ResourceName): unknown {
    return this.resourceFactory(this.project, resourceName);
  }

  // Collect resources of a specific type
  private collectResourcesOfType(
    type: ResourceFolderType,
    source: 'local' | 'module',
    moduleName?: string,
  ) {
    const resourceFolder =
      source === 'local'
        ? this.project.paths.resourcePath(type)
        : join(this.project.paths.modulesFolder, moduleName!, type);

    try {
      const entries = readdirSync(resourceFolder, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isFile() && allowedExtensions.includes(extname(entry.name))) {
          const resourceName =
            source === 'local'
              ? `${this.project.projectPrefix}/${type}/${stripExtension(entry.name)}`
              : `${moduleName}/${type}/${stripExtension(entry.name)}`;

          this.resourceRegistry.set(resourceName, {
            name: resourceName,
            type: type,
            path: entry.parentPath,
            source: source,
            moduleName: source === 'module' ? moduleName : undefined,
          });
        }
      }
    } catch {
      ResourceCache.logger.warn(
        `Resource folder '${resourceFolder}' is missing`,
      );
    }
  }

  // Returns instance of logger.
  private static get logger() {
    return getChildLogger({
      module: 'resourceCache',
    });
  }

  // Normalize resource name (string or ResourceName) to a consistent string format.
  private normalizeResourceName(name: string | ResourceName): string {
    if (typeof name === 'string') {
      const resName = resourceName(name);
      return resourceNameToString(resName);
    }
    return resourceNameToString(name);
  }

  // Remove resources matching a predicate.
  private removeResourcesWhere(
    predicate: (metadata: ResourceMetadata) => boolean,
  ) {
    for (const [key, metadata] of this.resourceRegistry) {
      if (predicate(metadata)) {
        this.removeResource(key);
      }
    }
  }

  /**
   * Add a resource to the registry.
   * @param resource New resource to add to the cache.
   */
  public addResource(resource: Resource) {
    const resName = resourceName(resource.name);
    const key = resourceNameToString(resName);

    // Determine if it's local or module resource
    const isModule = resName.prefix !== this.project.projectPrefix;

    this.resourceRegistry.set(key, {
      name: key,
      type: resName.type as ResourceFolderType, // todo: is there a way to this without cast?
      path: resource.path,
      source: isModule ? 'module' : 'local',
      moduleName: isModule ? resName.prefix : undefined,
    });
  }

  /**
   * Collects all resources; both local and modules.
   */
  public async collectAllResources(): Promise<void> {
    this.collectLocalResources();
    await this.collectModuleResources();
  }

  /**
   * Collect all local resources from the filesystem
   */
  public collectLocalResources() {
    const resourceTypes: ResourceFolderType[] = [
      'calculations',
      'cardTypes',
      'fieldTypes',
      'graphModels',
      'graphViews',
      'linkTypes',
      'reports',
      'templates',
      'workflows',
    ];

    for (const type of resourceTypes) {
      this.collectResourcesOfType(type, 'local');
    }
  }

  /**
   * Collect all module resources from the filesystem
   * Only collects modules that are registered in the project configuration
   * todo: For future:
   *   Should it also try to collect what is under .local/modules and then log for disparities?
   */
  public async collectModuleResources(): Promise<void> {
    try {
      const registeredModules = this.project.configuration.modules.map(
        (m) => m.name,
      );
      if (registeredModules.length === 0) {
        return;
      }

      const resourceTypes: ResourceFolderType[] = [
        'calculations',
        'cardTypes',
        'fieldTypes',
        'graphModels',
        'graphViews',
        'linkTypes',
        'reports',
        'templates',
        'workflows',
      ];

      for (const moduleName of registeredModules) {
        for (const type of resourceTypes) {
          this.collectResourcesOfType(type, 'module', moduleName);
        }
      }
    } catch {
      ResourceCache.logger.warn(`.cards/modules folder is missing`);
    }
  }

  /**
   * Extract resource type from a resource name string
   * @param name Resource name
   * @throws If resource type is invalid.
   * @returns Resource type
   */
  public extractResourceType(name: string): keyof ResourceMap {
    const type = resourceName(name).type;
    if (!type) {
      throw new Error(`Invalid resource type: ${type}`);
    }
    return type as keyof ResourceMap;
  }

  /**
   * Refresh local resources in the cache.
   */
  public changed() {
    for (const [key, metadata] of this.resourceRegistry) {
      if (metadata.source === 'local') {
        this.resourceRegistry.delete(key);
      }
    }
    this.collectLocalResources();
  }

  /**
   * Refresh module resources in the cache.
   * @param moduleName Name of the module. If given, will only update this modules resources.
   */
  public async changedModules(moduleName?: string): Promise<void> {
    for (const [key, metadata] of this.resourceRegistry) {
      if (
        metadata.source === 'module' &&
        (metadata.moduleName === moduleName || !moduleName)
      ) {
        this.resourceRegistry.delete(key);
      }
    }
    await this.collectModuleResources();
  }

  /**
   * Change resource name in cache, but keep instance information.
   * Cache has to create cache key for new and move the existing instance to it.
   * @param oldName Old name of the resource
   * @param newName New name of the resource
   */
  public changeResourceName(oldName: string, newName: string) {
    const oldKey = this.normalizeResourceName(oldName);
    const newKey = this.normalizeResourceName(newName);

    // Move instance from old key to new key if it exists
    if (this.instanceCache.has(oldKey)) {
      const resource = this.instanceCache.get(oldKey);
      this.instanceCache.delete(oldKey);
      this.instanceCache.set(newKey, resource);
    }

    // Update registry
    const metadata = this.resourceRegistry.get(oldKey);
    if (metadata) {
      this.resourceRegistry.delete(oldKey);
      this.resourceRegistry.set(newKey, {
        ...metadata,
        name: newKey,
      });
    }
  }

  /**
   * Handle file system changes
   * This is used by the Watcher in the Project class.
   * @param fileName A changed file in the file system.
   */
  public handleFileSystemChange(fileName: string) {
    try {
      const resource = pathToResourceName(this.project, fileName);
      if (!resource) {
        return;
      }

      const resourceName = resourceNameToString(resource);

      // Update registry with new path
      const isModule = resource.prefix !== this.project.projectPrefix;
      this.resourceRegistry.set(resourceName, {
        name: resourceName,
        type: resource.type as ResourceFolderType,
        path: dirname(fileName),
        source: isModule ? 'module' : 'local',
        moduleName: isModule ? resource.prefix : undefined,
      });

      // Invalidate cached instance
      this.invalidateResource(resourceName);
    } catch {
      ResourceCache.logger.warn(`Not a resource file: ${fileName}`);
    }
  }

  /**
   * Invalidate all resources of a specific module.
   * @param moduleName Name of the module.
   */
  public invalidateModule(moduleName: string) {
    this.removeResourcesWhere(
      (metadata) =>
        metadata.source === 'module' && metadata.moduleName === moduleName,
    );
  }

  /**
   * Invalidate a resource instance.
   * This forces reload on next access.
   * @param name Name of the resource to invalidate.
   */
  public invalidateResource(name: string | ResourceName) {
    const key = this.normalizeResourceName(name);

    // Remove from instance cache, but keep in registry
    this.instanceCache.delete(key);
  }

  /**
   * Get module names.
   * @returns Module names.
   */
  public moduleNames(): string[] {
    const names = new Set<string>();

    for (const [, metadata] of this.resourceRegistry) {
      if (metadata.source === 'module' && metadata.moduleName) {
        names.add(metadata.moduleName);
      }
    }

    return Array.from(names);
  }

  /**
   * Get certain types of resources from a specific module.
   * @param type Type of resource to fetch
   * @param moduleName Name of the module
   * @returns resources names from a specific module.
   */
  public moduleResourceNames(
    type: ResourceFolderType,
    moduleName: string,
  ): string[] {
    const names: string[] = [];

    for (const [key, metadata] of this.resourceRegistry) {
      if (
        metadata.type === type &&
        metadata.source === 'module' &&
        metadata.moduleName === moduleName
      ) {
        names.push(key);
      }
    }

    return names;
  }

  /**
   * Get resource with explicit type parameter
   * @param name Name of the resource
   * @param type Type of the resource
   * @template T Resource type
   * @throws If resource creation fails.
   * @returns Typed resource that matches name and type.
   */
  public resourceByType<T extends keyof ResourceMap>(
    name: string,
    type: T,
  ): ResourceMap[T] {
    const resourceName = this.buildResourceName(name, type);
    const key = resourceNameToString(resourceName);

    if (this.instanceCache.has(key)) {
      return this.instanceCache.get(key) as ResourceMap[T];
    }

    // Create new instance, but don't cache it yet
    const resource = this.createResourceObject(resourceName);
    if (!resource) {
      throw new Error(`Failed to create resource '${key}'`);
    }

    if (this.resourceRegistry.has(key)) {
      this.instanceCache.set(key, resource);
    }

    return resource as ResourceMap[T];
  }

  /**
   * Get resource by ResourceName object
   * @param name Resource name.
   * @throws If resource creation fails.
   * @returns Typed resource that matches the name.
   */
  public resourceByName<T extends keyof ResourceMap>(
    name: ResourceName,
  ): ResourceMap[T] {
    const key = resourceNameToString(name);

    if (this.instanceCache.has(key)) {
      return this.instanceCache.get(key) as ResourceMap[T];
    }

    // Create new instance (but don't cache it yet - will be cached on write())
    const resource = this.createResourceObject(name);
    if (!resource) {
      throw new Error(`Failed to create resource '${key}'`);
    }

    if (this.resourceRegistry.has(key)) {
      this.instanceCache.set(key, resource);
    }

    return resource as ResourceMap[T];
  }

  /**
   * Check if a resource exists.
   * @param name Resource name to check.
   * @returns true, if resource is in the cache; false otherwise.
   */
  public resourceExists(name: string | ResourceName): boolean {
    const key = this.normalizeResourceName(name);
    return this.resourceRegistry.has(key);
  }

  /**
   * Remove a resource from cache. This includes both registry and instance cache.
   * @param name Resource to remove.
   */
  public removeResource(name: string | ResourceName) {
    const key = this.normalizeResourceName(name);
    const metadata = this.resourceRegistry.get(key);

    if (!metadata) {
      return;
    }

    // Remove from both registry and instance cache
    this.resourceRegistry.delete(key);
    this.instanceCache.delete(key);
  }

  /**
   * Get plural resource type name from singular type name
   * @param singular Resource type as singular name (e.g. 'workflow').
   * @returns Resource type (as a key in ResourceMap)
   */
  public resourceTypeFromSingularType(singular: string): keyof ResourceMap {
    const plural = singularToPluralResourceType[singular];
    if (!plural) {
      throw new Error(`Unknown singular resource type: ${singular}`);
    }
    return plural;
  }

  /**
   * Get resources with full metadata for a specific type
   * @param type Type of resources to get.
   * @param from Where to return resources from (all, local, imported modules)
   * @template T Resource type
   * @returns Array of resources with metadata.
   */
  public resources<T extends keyof ResourceMap>(
    type: T,
    from: ResourcesFrom = ResourcesFrom.all,
  ): Array<ResourceMap[T]> {
    const resources: ResourceMap[T][] = [];

    for (const [key, metadata] of this.resourceRegistry) {
      if (metadata.type !== type) continue;

      if (from === ResourcesFrom.localOnly && metadata.source !== 'local')
        continue;
      if (from === ResourcesFrom.importedOnly && metadata.source !== 'module')
        continue;

      // Get or create the actual resource instance
      const resName = resourceName(key);
      const resource = this.resourceByName<T>(resName);
      resources.push(resource);
    }

    return resources;
  }

  /**
   * Updates a resource instance with new data.
   * @param name Name of the resource to update
   * @param instance New data for the resource.
   */
  public updateResource(name: string | ResourceName, instance: unknown) {
    const key = this.normalizeResourceName(name);

    // If resource doesn't exist in registry, add it
    if (!this.resourceRegistry.has(key)) {
      const resName = typeof name === 'string' ? resourceName(name) : name;
      const isModule = resName.prefix !== this.project.projectPrefix;
      const resourcePath = isModule
        ? this.project.paths.moduleResourcePath(
            resName.prefix,
            resName.type as ResourceFolderType,
          )
        : this.project.paths.resourcePath(resName.type as ResourceFolderType);

      this.resourceRegistry.set(key, {
        name: key,
        type: resName.type as ResourceFolderType,
        path: resourcePath,
        source: isModule ? 'module' : 'local',
        moduleName: isModule ? resName.prefix : undefined,
      });
    }

    // Update with provided instance
    this.instanceCache.set(key, instance);
  }
}
