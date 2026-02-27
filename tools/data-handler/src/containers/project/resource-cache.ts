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
import { type Dirent, readdirSync, readFileSync } from 'node:fs';

import { getChildLogger } from '../../utils/log-utils.js';
import {
  pathToResourceName,
  resourceName,
  resourceNameToString,
} from '../../utils/resource-utils.js';
import { stripExtension } from '../../utils/file-utils.js';
import { VALID_FOLDER_RESOURCE_FILES } from '../../utils/constants.js';

import { CalculationResource } from '../../resources/calculation-resource.js';
import { CardTypeResource } from '../../resources/card-type-resource.js';
import { FieldTypeResource } from '../../resources/field-type-resource.js';
import { GraphModelResource } from '../../resources/graph-model-resource.js';
import { GraphViewResource } from '../../resources/graph-view-resource.js';
import { LinkTypeResource } from '../../resources/link-type-resource.js';
import { ReportResource } from '../../resources/report-resource.js';
import { TemplateResource } from '../../resources/template-resource.js';
import { WorkflowResource } from '../../resources/workflow-resource.js';

import type { Project } from '../project.js';
import type { ResourceFolderType } from '../../interfaces/project-interfaces.js';
import type { ResourceName } from '../../utils/resource-utils.js';

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
  contentFiles?: Map<string, string>;
}

// Allowed files in resource instance data.
const allowedExtensions = ['.lp', '.json'];

// Resource types that have internal folders with content files
const FOLDER_RESOURCE_TYPES: ResourceFolderType[] = [
  'calculations',
  'graphModels',
  'graphViews',
  'reports',
  'templates',
];

/**
 * ResourceCache handles all resource collecting, caching, and management.
 * Uses a two-layered approach:
 *  1. lightweight registry for collecting items that exist on disk
 *  2. more complex instance cache that contains full instance data of a resource.
 *
 * Resource populates the first layer automatically when created.
 * When new instance of a resource is created by an access function (e.g. resourceByType() or resourceByName()),
 * instance of resource is saved to cache.
 *
 */
export class ResourceCache {
  private resourceRegistry = new Map<string, ResourceMetadata>();
  private instanceCache = new Map<string, unknown>();

  private project: Project;

  // Private constructor - use ResourceCache.create() instead.
  private constructor(project: Project) {
    this.project = project;
  }

  // Initialize the cache by collecting all resources.
  private initialize(): void {
    this.collectAllResources();
  }

  // Build a full resource name from partial name and type.
  private buildResourceName(name: string, type?: string): ResourceName {
    if (type && name && name.split('/').length === 1) {
      name = `${this.project.projectPrefix}/${type}/${name}`;
    }
    return resourceName(name);
  }

  // Create a resource object instance
  private createResourceObject(resourceName: ResourceName): unknown {
    const key = resourceNameToString(resourceName);
    const metadata = this.resourceRegistry.get(key);
    let resource: unknown;

    if (resourceName.type === 'calculations') {
      resource = new CalculationResource(this.project, resourceName);
    } else if (resourceName.type === 'cardTypes') {
      resource = new CardTypeResource(this.project, resourceName);
    } else if (resourceName.type === 'fieldTypes') {
      resource = new FieldTypeResource(this.project, resourceName);
    } else if (resourceName.type === 'graphModels') {
      resource = new GraphModelResource(this.project, resourceName);
    } else if (resourceName.type === 'graphViews') {
      resource = new GraphViewResource(this.project, resourceName);
    } else if (resourceName.type === 'linkTypes') {
      resource = new LinkTypeResource(this.project, resourceName);
    } else if (resourceName.type === 'reports') {
      resource = new ReportResource(this.project, resourceName);
    } else if (resourceName.type === 'templates') {
      resource = new TemplateResource(this.project, resourceName);
    } else if (resourceName.type === 'workflows') {
      resource = new WorkflowResource(this.project, resourceName);
    } else {
      throw new Error(`Unsupported resource type '${resourceName.type}'`);
    }

    // Populate content files into folder resources
    if (metadata?.contentFiles && this.hasSetContentFiles(resource)) {
      resource.setContentFiles(metadata.contentFiles);
    }

    return resource;
  }

  // Collects all resources; both local and modules.
  private collectAllResources() {
    this.collectLocalResources();
    this.collectModuleResources();
  }

  // Collect all local resources from the filesystem
  private collectLocalResources() {
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

  // Collect all module resources from the filesystem
  private collectModuleResources() {
    try {
      const moduleEntries = readdirSync(this.project.paths.modulesFolder, {
        withFileTypes: true,
      });
      const moduleNames = moduleEntries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);

      if (moduleNames.length === 0) {
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

      for (const moduleName of moduleNames) {
        for (const type of resourceTypes) {
          this.collectResourcesOfType(type, 'module', moduleName);
        }
      }
    } catch {
      ResourceCache.logger.debug(
        `.cards/modules folder is missing or inaccessible`,
      );
    }
  }

  // Collects one folder resource's internal folder content.
  private collectResourceContentFiles(type: ResourceFolderType, entry: Dirent) {
    const identifier = stripExtension(entry.name);
    let contentFiles: Map<string, string> | undefined = undefined;

    // Set content files for folder resources
    if (FOLDER_RESOURCE_TYPES.includes(type)) {
      const internalFolder = join(entry.parentPath, identifier);
      try {
        const contentEntries = readdirSync(internalFolder, {
          withFileTypes: true,
        });
        const files = new Map<string, string>();

        for (const contentEntry of contentEntries) {
          if (
            contentEntry.isFile() &&
            VALID_FOLDER_RESOURCE_FILES.includes(contentEntry.name)
          ) {
            try {
              const filePath = join(internalFolder, contentEntry.name);
              const content = readFileSync(filePath, 'utf8');
              files.set(contentEntry.name, content);
            } catch {
              ResourceCache.logger.warn(
                `Failed to read content file '${contentEntry.name}' for resource '${name}'`,
              );
            }
          }
        }

        contentFiles = files.size > 0 ? files : undefined;
      } catch {
        // Internal folder doesn't exist - this is okay
      }
    }
    return contentFiles;
  }

  // Collect resources of a specific type
  private collectResourcesOfType(
    type: ResourceFolderType,
    source: 'local',
  ): void;
  private collectResourcesOfType(
    type: ResourceFolderType,
    source: 'module',
    moduleName: string,
  ): void;
  private collectResourcesOfType(
    type: ResourceFolderType,
    source: 'local' | 'module',
    moduleName?: string,
  ) {
    // For local resources, use writable path which returns draft if it exists
    const resourceFolder =
      source === 'local'
        ? this.project.paths.resourceFolderFor(
            this.project.configuration.latestVersion,
            type,
          )
        : this.project.paths.moduleResourcePath(moduleName!, type);

    try {
      const entries = readdirSync(resourceFolder, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isFile() && allowedExtensions.includes(extname(entry.name))) {
          const name =
            source === 'local'
              ? `${this.project.projectPrefix}/${type}/${stripExtension(entry.name)}`
              : `${moduleName}/${type}/${stripExtension(entry.name)}`;

          this.resourceRegistry.set(name, {
            name: name,
            type: type,
            path: entry.parentPath,
            source: source,
            moduleName: source === 'module' ? moduleName : undefined,
            contentFiles: this.collectResourceContentFiles(type, entry),
          });
        }
      }
    } catch {
      ResourceCache.logger.warn(
        `Resource folder '${resourceFolder}' is missing`,
      );
    }
  }

  // Removes a key from cache layers.
  private deleteKey(key: string) {
    this.resourceRegistry.delete(key);
    this.instanceCache.delete(key);
  }

  // Type guard to check if resource has setContentFiles method
  private hasSetContentFiles(
    resource: unknown,
  ): resource is { setContentFiles: (files: Map<string, string>) => void } {
    return (
      typeof (resource as { setContentFiles?: unknown }).setContentFiles ===
      'function'
    );
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

  /**
   * Add a resource instance to cache. If using
   * @param name Name of the resource to update
   * @param instance New data for the resource.
   */
  public addResource(name: string | ResourceName, instance: unknown) {
    const key = this.normalizeResourceName(name);
    if (!this.resourceRegistry.has(key)) {
      const resName = typeof name === 'string' ? resourceName(name) : name;
      const isModule = resName.prefix !== this.project.projectPrefix;
      const resourcePath = isModule
        ? this.project.paths.moduleResourcePath(
            resName.prefix,
            resName.type as ResourceFolderType,
          )
        : this.project.paths.resourceFolderFor(
            this.project.configuration.latestVersion,
            resName.type as ResourceFolderType,
          );

      this.resourceRegistry.set(key, {
        name: key,
        type: resName.type as ResourceFolderType,
        path: resourcePath,
        source: isModule ? 'module' : 'local',
        moduleName: isModule ? resName.prefix : undefined,
        contentFiles: undefined, // resources will set this as-needed
      });

      this.instanceCache.set(key, instance);
    }
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
  public changedModules(moduleName?: string) {
    for (const [key, metadata] of this.resourceRegistry) {
      if (
        metadata.source === 'module' &&
        (metadata.moduleName === moduleName || !moduleName)
      ) {
        this.resourceRegistry.delete(key);
      }
    }
    this.collectModuleResources();
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
   * Creates and initializes a ResourceCache.
   * This performs filesystem I/O to collect all resources.
   * @param project Project to use
   * @returns Initialized ResourceCache
   */
  public static create(project: Project): ResourceCache {
    const cache = new ResourceCache(project);
    cache.initialize();
    return cache;
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

      const name = resourceNameToString(resource);

      // Update registry with new path
      const isModule = resource.prefix !== this.project.projectPrefix;
      this.resourceRegistry.set(name, {
        name: name,
        type: resource.type as ResourceFolderType,
        path: dirname(fileName),
        source: isModule ? 'module' : 'local',
        moduleName: isModule ? resource.prefix : undefined,
        contentFiles: undefined,
      });

      // Invalidate cached instance
      this.invalidateResource(name);
    } catch {
      ResourceCache.logger.warn(`Not a resource file: ${fileName}`);
    }
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
   * Invalidate all resources of a specific module.
   * @param moduleName Name of the module.
   */
  public removeModule(moduleName: string) {
    for (const [key, metadata] of this.resourceRegistry) {
      if (
        metadata &&
        metadata.source === 'module' &&
        metadata.moduleName === moduleName
      ) {
        this.removeResource(key);
      }
    }
  }

  /**
   * Remove a resource from cache. This includes both registry and instance cache.
   * @param name Resource to remove.
   */
  public removeResource(name: string | ResourceName) {
    const key = this.normalizeResourceName(name);
    if (!this.resourceRegistry.get(key)) {
      return;
    }
    this.deleteKey(key);
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
    const builtName = this.buildResourceName(name, type);
    const key = resourceNameToString(builtName);

    if (this.instanceCache.has(key)) {
      return this.instanceCache.get(key) as ResourceMap[T];
    }

    const resource = this.createResourceObject(builtName);
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
  public has(name: string | ResourceName): boolean {
    const key = this.normalizeResourceName(name);
    return this.resourceRegistry.has(key);
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
}
