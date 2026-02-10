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

import type { ResourceFolderType } from '../../interfaces/project-interfaces.js';

/**
 * Handles paths for a project.
 * This is a stateless path mapper — it does not know about versioning policy.
 * Version-dependent paths are computed via methods that take a version parameter.
 */
export class ProjectPaths {
  constructor(private path: string) {}

  public get calculationCardsFolder(): string {
    return join(this.calculationFolder, 'cards');
  }

  public get calculationFolder(): string {
    return join(this.path, '.calc');
  }

  public get calculationResourcesFolder(): string {
    return join(this.calculationFolder, 'resources');
  }

  public get cardRootFolder(): string {
    return join(this.path, 'cardRoot');
  }

  public get configurationFile(): string {
    return join(this.localFolder, 'cardsConfig.json');
  }

  public get internalRootFolder(): string {
    return join(this.path, '.cards');
  }

  public get logPath(): string {
    return join(this.path, '.logs', 'cyberismo_data-handler.log');
  }

  public migrationLogFor(version: number): string {
    return join(
      this.localFolder,
      'migrations',
      `migrationLog-${version}.jsonl`,
    );
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

  public get localFolder(): string {
    return join(this.internalRootFolder, 'local');
  }

  public versionedResourcesFolderFor(version: number): string {
    return join(this.localFolder, version.toString());
  }

  /**
   * Return path to a resource type folder for a specific version.
   * @param version Version number
   * @param resourceType Type of resource
   * @returns path to a resources folder (e.g. '.cards/local/1/cardTypes')
   */
  public resourceFolderFor(
    version: number,
    resourceType: ResourceFolderType,
  ): string {
    return join(this.versionedResourcesFolderFor(version), resourceType);
  }

  public get tempCardFolder(): string {
    return join(this.tempFolder, 'cards');
  }

  public get tempFolder(): string {
    return join(this.path, '.temp');
  }
}
