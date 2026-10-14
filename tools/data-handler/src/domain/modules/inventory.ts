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

import { getChildLogger } from '../../shared/utils/log-utils.js';
import { readJsonFile } from '../../shared/utils/json.js';
import { isGitLocation } from '../../shared/utils/location.js';
import {
  type ModuleDeclaration,
  type ModuleInstallation,
} from '../mutations/replay/module-types.js';
import {
  toVersion,
  toVersionRange,
  type Version,
  type VersionRange,
} from '../../shared/utils/version.js';
import { type Source, type VersionSource } from '@cyberismo/model';

import type { Checkout } from '../../infra/checkout.js';
import type {
  ModuleInfo,
  ModuleSetting,
  ProjectModuleInfo,
} from '@cyberismo/model';

const logger = getChildLogger({ module: 'inventory' });

/** Top-level declarations persisted in `project.configuration.modules`. */
export function declaredModules(checkout: Checkout): ModuleDeclaration[] {
  const settings: ModuleSetting[] = checkout.configuration.modules;
  return settings.map((setting) => toDeclaration(checkout, setting));
}

export async function installedModules(
  checkout: Checkout,
): Promise<ModuleInstallation[]> {
  const modulesFolder = checkout.paths.modulesFolder;

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
    checkout.configuration.modules.map((m) => [m.name, m]),
  );

  const installations: ModuleInstallation[] = [];
  for (const name of entries) {
    const installation = await toInstallation(
      checkout,
      name,
      declaredByName.get(name),
    );
    if (installation) {
      installations.push(installation);
    }
  }

  return installations;
}

/**
 * {@link installedModules}, with transitive installations enriched with a
 * source location. A transitive installation's source is not persisted in
 * the project's own configuration, but each installed module's
 * `cardsConfig.json` declares its dependencies with locations — so the
 * location is recovered from there. The project's own declarations win,
 * then the first installed module (in installation order) that declares
 * the dependency. An installation whose location cannot be found anywhere
 * keeps its empty location.
 */
/** Installed modules as name/version pairs, sorted by name. */
export async function moduleInfos(checkout: Checkout): Promise<ModuleInfo[]> {
  const installed = await installedModules(checkout);
  return installed
    .map((m) => ({ name: m.name, version: m.version }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function versionSourceOf(source: Source): VersionSource {
  if (source.private) return 'private';
  return isGitLocation(source.location) ? 'git' : 'file';
}

/** Installed modules with their declared range, dependents and version source. */
export async function projectModules(
  checkout: Checkout,
): Promise<ProjectModuleInfo[]> {
  const installed = await installedModulesWithSources(checkout);
  const declared = new Map(declaredModules(checkout).map((d) => [d.name, d]));
  return installed
    .map((m) => ({
      name: m.name,
      installedVersion: m.version,
      declaredRange: declared.get(m.name)?.versionRange,
      isRoot: declared.has(m.name),
      parents: installed
        .filter((p) => p.declaredDependencies.includes(m.name))
        .map((p) => p.name)
        .sort(),
      versionSource:
        m.source.location === '' ? undefined : versionSourceOf(m.source),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function installedModulesWithSources(
  checkout: Checkout,
): Promise<ModuleInstallation[]> {
  const installations = await installedModules(checkout);
  if (installations.every((i) => i.source.location !== '')) {
    return installations;
  }

  const sourceByName = new Map<string, Source>();
  for (const setting of checkout.configuration.modules) {
    if (!sourceByName.has(setting.name)) {
      sourceByName.set(setting.name, {
        location: setting.location,
        private: setting.private ?? false,
      });
    }
  }
  for (const installation of installations) {
    for (const dep of await declaredDependencySources(checkout, installation)) {
      if (!sourceByName.has(dep.name)) {
        sourceByName.set(dep.name, dep.source);
      }
    }
  }

  return installations.map((installation) => {
    if (installation.source.location !== '') {
      return installation;
    }
    const source = sourceByName.get(installation.name);
    return source ? { ...installation, source: { ...source } } : installation;
  });
}

/** Dependency declarations (with locations) from one installation's own config. */
async function declaredDependencySources(
  checkout: Checkout,
  installation: ModuleInstallation,
): Promise<Array<{ name: string; source: Source }>> {
  let config: InstallationConfig | undefined;
  try {
    config = await readJsonFile(
      checkout.paths.moduleConfigurationFile(installation.name),
    );
  } catch {
    return [];
  }

  const deps: Array<{ name: string; source: Source }> = [];
  for (const dep of config?.modules ?? []) {
    if (
      typeof dep.name === 'string' &&
      dep.name.length > 0 &&
      typeof dep.location === 'string' &&
      dep.location.length > 0
    ) {
      deps.push({
        name: dep.name,
        source: { location: dep.location, private: dep.private === true },
      });
    }
  }
  return deps;
}

function toDeclaration(
  checkout: Checkout,
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
    project: checkout.basePath,
    name: setting.name,
    source,
    versionRange,
    parent: undefined,
  };
}

async function toInstallation(
  checkout: Checkout,
  name: string,
  declaredSetting: ModuleSetting | undefined,
): Promise<ModuleInstallation | undefined> {
  const path = join(checkout.paths.modulesFolder, name);
  const configPath = checkout.paths.moduleConfigurationFile(name);

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
    project: checkout.basePath,
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
  modules?: Array<{ name?: string; location?: string; private?: boolean }>;
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
