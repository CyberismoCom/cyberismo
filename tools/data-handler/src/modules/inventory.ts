/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026

  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

import semver from 'semver';

import { getChildLogger } from '../utils/log-utils.js';
import { readJsonFile } from '../utils/json.js';
import {
  toVersion,
  toVersionRange,
  type ModuleDeclaration,
  type ModuleInstallation,
  type Source,
  type Version,
  type VersionRange,
} from './types.js';

import type { Project } from '../containers/project.js';
import type { ModuleSetting } from '../interfaces/project-interfaces.js';

/**
 * Read-only view over a project's declared and installed modules.
 *
 * The spec distinguishes between {@link ModuleDeclaration} (what the
 * project's `cardsConfig.json` says it wants) and
 * {@link ModuleInstallation} (what is physically present under
 * `.cards/modules/<name>/`). The inventory layer materialises both
 * without mutating anything.
 */
export interface Inventory {
  /**
   * Project-level, top-level declarations — the entries persisted in
   * `project.configuration.modules`. Transitive (parent != null)
   * declarations are produced by the resolver at reconcile time and
   * are never persisted, so this method always returns declarations
   * with `parent` absent.
   */
  declared(project: Project): ModuleDeclaration[];

  /**
   * Modules physically installed under `.cards/modules/<name>/`. Each
   * entry is reconstructed by reading the installed module's own
   * `cardsConfig.json`. Folders without a readable config are
   * skipped.
   */
  installed(project: Project): Promise<ModuleInstallation[]>;
}

/**
 * Factory for an {@link Inventory}. Stateless — all state lives on
 * the {@link Project} passed into each method.
 */
export function createInventory(): Inventory {
  return new FilesystemInventory();
}

class FilesystemInventory implements Inventory {
  private readonly logger = getChildLogger({ module: 'inventory' });

  declared(project: Project): ModuleDeclaration[] {
    const settings: ModuleSetting[] = project.configuration.modules;
    return settings.map((setting) => this.toDeclaration(project, setting));
  }

  async installed(project: Project): Promise<ModuleInstallation[]> {
    const modulesFolder = project.paths.modulesFolder;

    let entries: string[];
    try {
      entries = await readdir(modulesFolder);
    } catch (error) {
      // `.cards/modules/` may legitimately not exist when no module
      // has been imported yet. Any other error is surfaced.
      if (isEnoent(error)) {
        return [];
      }
      throw error;
    }

    const declaredByName = new Map<string, ModuleSetting>(
      project.configuration.modules.map((m) => [m.name, m]),
    );

    const installations: ModuleInstallation[] = [];
    for (const name of entries) {
      const installation = await this.toInstallation(
        project,
        name,
        declaredByName.get(name),
      );
      if (installation) {
        installations.push(installation);
      }
    }

    return installations;
  }

  private toDeclaration(
    project: Project,
    setting: ModuleSetting,
  ): ModuleDeclaration {
    const source: Source = {
      location: setting.location,
      private: setting.private ?? false,
    };

    let versionRange: VersionRange | undefined;
    if (setting.version) {
      if (semver.validRange(setting.version) === null) {
        this.logger.warn(
          { module: setting.name, range: setting.version },
          'ignoring invalid semver range on module declaration',
        );
      } else {
        versionRange = toVersionRange(setting.version);
      }
    }

    return {
      project: project.basePath,
      name: setting.name,
      source,
      versionRange,
      parent: undefined,
    };
  }

  private async toInstallation(
    project: Project,
    name: string,
    declaredSetting: ModuleSetting | undefined,
  ): Promise<ModuleInstallation | undefined> {
    const path = join(project.paths.modulesFolder, name);
    const configPath = project.paths.moduleConfigurationFile(name);

    let config: { version?: string } | undefined;
    try {
      config = await readJsonFile(configPath);
    } catch (error) {
      this.logger.debug(
        { module: name, path: configPath, err: serializeError(error) },
        'skipping module folder without readable cardsConfig.json',
      );
      return undefined;
    }

    if (!config) {
      this.logger.debug(
        { module: name, path: configPath },
        'skipping module folder with empty cardsConfig.json',
      );
      return undefined;
    }

    let source: Source;
    if (declaredSetting) {
      source = {
        location: declaredSetting.location,
        private: declaredSetting.private ?? false,
      };
    } else {
      // Transitive installation: the current v1 data model doesn't
      // persist the source of dependencies declared by other
      // installations. Leave it empty; `location` is still a string
      // so the Source shape stays honest.
      this.logger.debug(
        { module: name },
        'installed module has no top-level declaration; leaving source.location empty',
      );
      source = { location: '', private: false };
    }

    const version = parseInstalledVersion(config.version);

    return {
      project: project.basePath,
      name,
      source,
      version,
      path,
    };
  }
}

function parseInstalledVersion(raw: unknown): Version | undefined {
  if (typeof raw !== 'string' || raw.length === 0) {
    return undefined;
  }
  try {
    return toVersion(raw);
  } catch {
    // toVersion throws on invalid semver; treat as missing rather
    // than failing the whole inventory read.
    return undefined;
  }
}

function isEnoent(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'ENOENT'
  );
}

function serializeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
