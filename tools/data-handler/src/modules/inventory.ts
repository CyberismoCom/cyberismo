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

const logger = getChildLogger({ module: 'inventory' });

/** Top-level declarations persisted in `project.configuration.modules`. */
export function declaredModules(project: Project): ModuleDeclaration[] {
  const settings: ModuleSetting[] = project.configuration.modules;
  return settings.map((setting) => toDeclaration(project, setting));
}

export async function installedModules(
  project: Project,
): Promise<ModuleInstallation[]> {
  const modulesFolder = project.paths.modulesFolder;

  let entries: string[];
  try {
    entries = await readdir(modulesFolder);
  } catch (error) {
    // `.cards/modules/` may not exist yet when no module has been imported.
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
    const installation = await toInstallation(
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

function toDeclaration(
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
      logger.warn(
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

async function toInstallation(
  project: Project,
  name: string,
  declaredSetting: ModuleSetting | undefined,
): Promise<ModuleInstallation | undefined> {
  const path = join(project.paths.modulesFolder, name);
  const configPath = project.paths.moduleConfigurationFile(name);

  let config: InstallationConfig | undefined;
  try {
    config = await readJsonFile(configPath);
  } catch (error) {
    logger.debug(
      { module: name, path: configPath, err: serializeError(error) },
      'skipping module folder without readable cardsConfig.json',
    );
    return undefined;
  }

  if (!config) {
    logger.debug(
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
    // Transitive installation: source not persisted, leave it empty.
    logger.debug(
      { module: name },
      'installed module has no top-level declaration; leaving source.location empty',
    );
    source = { location: '', private: false };
  }

  const version = parseInstalledVersion(config.version);
  const declaredDependencies = extractDependencyNames(config.modules);

  return {
    project: project.basePath,
    name,
    source,
    version,
    path,
    declaredDependencies,
  };
}

/**
 * Minimal shape of an installation's own `cardsConfig.json` — only the
 * fields inventory reads. Other fields are allowed and ignored.
 */
interface InstallationConfig {
  version?: string;
  modules?: Array<{ name?: string }>;
}

function parseInstalledVersion(raw: unknown): Version | undefined {
  if (typeof raw !== 'string' || raw.length === 0) {
    return undefined;
  }
  try {
    return toVersion(raw);
  } catch {
    // Treat invalid semver as missing rather than failing the whole read.
    return undefined;
  }
}

function extractDependencyNames(
  modules: InstallationConfig['modules'],
): string[] {
  if (!modules) {
    return [];
  }
  const names: string[] = [];
  for (const dep of modules) {
    if (typeof dep.name === 'string' && dep.name.length > 0) {
      names.push(dep.name);
    }
  }
  return names;
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
