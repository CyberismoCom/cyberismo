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

import { join } from 'node:path';
import { existsSync } from 'node:fs';

import type {
  ResourceFolderType,
  VersioningMode,
} from '../../interfaces/project-interfaces.js';

/**
 * Handles paths for a project.
 */
export class ProjectPaths {
  private pathMap: Map<ResourceFolderType, string>;
  private currentVersion: number;
  private versioningMode: VersioningMode;

  constructor(
    private path: string,
    version: number = 1,
    versioningMode: VersioningMode = 'direct',
  ) {
    this.currentVersion = version;
    this.versioningMode = versioningMode;
    this.pathMap = new Map([
      ['calculations', this.calculationProjectFolder],
      ['cardTypes', this.cardTypesFolder],
      ['fieldTypes', this.fieldTypesFolder],
      ['graphModels', this.graphModelsFolder],
      ['graphViews', this.graphViewsFolder],
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
    return join(this.versionedBaseFolder, 'calculations');
  }

  public get calculationResourcesFolder(): string {
    return join(this.calculationFolder, 'resources');
  }

  public get cardRootFolder(): string {
    return join(this.path, 'cardRoot');
  }

  public get cardTypesFolder(): string {
    return join(this.versionedBaseFolder, 'cardTypes');
  }

  public get configurationFile(): string {
    return join(this.localFolder, 'cardsConfig.json');
  }

  public get configurationChangesLog(): string {
    return join(this.migrationLogFolder, 'current', 'migrationLog.jsonl');
  }

  public get fieldTypesFolder(): string {
    return join(this.versionedBaseFolder, 'fieldTypes');
  }

  public get graphModelsFolder(): string {
    return join(this.versionedBaseFolder, 'graphModels');
  }

  public get graphViewsFolder(): string {
    return join(this.versionedBaseFolder, 'graphViews');
  }

  public get internalRootFolder(): string {
    return join(this.path, '.cards');
  }

  public get linkTypesFolder(): string {
    return join(this.versionedBaseFolder, 'linkTypes');
  }

  public get logPath(): string {
    return join(this.path, '.logs', 'cyberismo_data-handler.log');
  }

  public get migrationLogFolder(): string {
    return join(this.localFolder, 'migrations');
  }

  public get currentMigrationFolder(): string {
    return join(this.migrationLogFolder, 'current');
  }

  public versionedMigrationFolder(version: number): string {
    return join(this.migrationLogFolder, version.toString());
  }

  public get modulesFolder(): string {
    return join(this.internalRootFolder, 'modules');
  }

  public moduleResourcePath(
    modulePrefix: string,
    resourceType: ResourceFolderType,
  ) {
    const moduleRoot = join(this.modulesFolder, modulePrefix);
    return join(moduleRoot, resourceType);
  }

  /**
   * Get module resource path, handling both versioned and legacy structures.
   * For now, modules are always imported flat (resources directly under module prefix).
   * This method exists for future versioned module support.
   * @param modulePrefix Module prefix
   * @param resourceType Type of resource
   * @returns Path to module's resource folder
   */
  public moduleResourcePathCompat(
    modulePrefix: string,
    resourceType: ResourceFolderType,
  ): string {
    // Modules are currently imported flat (not versioned)
    const moduleRoot = join(this.modulesFolder, modulePrefix);
    return join(moduleRoot, resourceType);
  }

  public get localFolder(): string {
    return join(this.internalRootFolder, 'local');
  }

  public get versionedBaseFolder(): string {
    return join(this.localFolder, this.currentVersion.toString());
  }

  public versionedResourcesFolderFor(version: number): string {
    return join(this.localFolder, version.toString());
  }

  public get resourcesFolder(): string {
    return this.versionedBaseFolder;
  }

  public get reportsFolder(): string {
    return join(this.versionedBaseFolder, 'reports');
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

  public get tempCardFolder(): string {
    return join(this.tempFolder, 'cards');
  }

  public get tempFolder(): string {
    return join(this.path, '.temp');
  }

  public get templatesFolder(): string {
    return join(this.versionedBaseFolder, 'templates');
  }

  public get workflowsFolder(): string {
    return join(this.versionedBaseFolder, 'workflows');
  }

  /**
   * Get the current version number.
   */
  public get version(): number {
    return this.currentVersion;
  }

  /**
   * Get the draft version number (currentVersion + 1).
   */
  public get draft(): number {
    return this.currentVersion + 1;
  }

  /**
   * Check if a draft folder exists.
   * Draft folder is the next version folder (currentVersion + 1).
   */
  public get hasDraft(): boolean {
    return existsSync(this.draftBaseFolder);
  }

  /**
   * Get the draft base folder path (.cards/local/{version+1}/).
   */
  public get draftBaseFolder(): string {
    return join(this.localFolder, this.draft.toString());
  }

  /**
   * Get the writable base folder based on versioning mode.
   * - 'direct' mode: Returns current version folder (changes go directly to current version)
   * - 'draft-publish' mode: Returns draft folder (version+1, changes go to draft)
   */
  public get writableBaseFolder(): string {
    if (this.versioningMode === 'direct') {
      return this.versionedBaseFolder;
    }
    // draft-publish mode: writes always go to draft folder
    return this.draftBaseFolder;
  }

  /**
   * Get the writable resource path for a specific resource type.
   * Returns path in draft folder if it exists, otherwise in current version folder.
   * @param resourceType Type of resource
   * @returns Path to the writable resource folder
   */
  public writableResourcePath(resourceType: ResourceFolderType): string {
    return join(this.writableBaseFolder, resourceType);
  }

  /**
   * Check if this project uses the legacy (non-versioned) structure.
   * Legacy projects have resources directly under .cards/local/ without version folders.
   */
  public get isLegacyStructure(): boolean {
    // Check for common resource folders directly under .cards/local/
    const resourceFolders = ['cardTypes', 'workflows', 'templates'];

    for (const folder of resourceFolders) {
      const legacyPath = join(this.localFolder, folder);
      if (existsSync(legacyPath)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get the resources folder, handling both versioned and legacy structures.
   * This is useful when importing modules that might not be migrated yet.
   */
  public get resourcesFolderCompat(): string {
    if (this.isLegacyStructure) {
      return this.localFolder;
    }
    return this.versionedBaseFolder;
  }
}
