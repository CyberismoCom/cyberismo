/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2025
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { z } from 'zod';

import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

import {
  canonicalHubLocation,
  hubModuleListUrl,
  MODULE_LIST_FILE,
} from '../utils/hub-utils.js';
import { egressFetch } from '../utils/egress.js';
import { getChildLogger } from '../utils/log-utils.js';
import { readJsonFile, writeJsonFile } from '../utils/json.js';
import { validateJson } from '../utils/validate.js';
import { write } from '../utils/rw-lock.js';

import type { ModuleSetting } from '../interfaces/project-interfaces.js';
import type { Project } from '../containers/project.js';

// Cached data of a single hub.
export interface CachedHub {
  location: string;
  version: number;
  displayName?: string;
  description?: string;
  modules: ModuleSetting[];
}

// A hub's moduleList.json. HUB_SCHEMA is the contract; these schemas only
// recover the types that Response.json() erases, so they are loose and pass
// unknown fields through into the cache untouched.
const hubDocumentSchema = z.looseObject({
  version: z.number().optional(),
  displayName: z.string().optional(),
  description: z.string().optional(),
  modules: z
    .array(z.looseObject({ name: z.string(), location: z.string() }))
    .optional(),
});

type HubDocument = z.infer<typeof hubDocumentSchema>;

const hubVersionSchema = z.looseObject({ version: z.number().optional() });

// Structure of .temp/moduleList.json file.
export interface ModuleListFile {
  modules: ModuleSetting[];
  hubs: CachedHub[];
}

// A hub that could not be read during a fetch.
export interface HubFetchFailure {
  location: string;
  message: string;
}

const FETCH_TIMEOUT_MS = 30 * 1000; // 30s timeout for fetching a hub file.
const MAX_RESPONSE_SIZE_MB = 1024 * 1024; // 1MB limit for safety
const HUB_SCHEMA = 'hubSchema';
const TEMP_FOLDER = `.temp`;

export const MODULE_LIST_FULL_PATH = `${TEMP_FOLDER}/${MODULE_LIST_FILE}`;

export class Fetch {
  private moduleListPath;
  constructor(private project: Project) {
    this.moduleListPath = resolve(this.project.basePath, MODULE_LIST_FULL_PATH);
  }

  private get logger() {
    return getChildLogger({
      module: 'fetch',
    });
  }

  // Checks the version of the remote moduleList.json.
  private async checkRemoteVersion(
    location: string,
  ): Promise<number | undefined> {
    try {
      const url = hubModuleListUrl(location);
      if (!['http:', 'https:'].includes(url.protocol)) {
        return undefined;
      }

      const response = await egressFetch(url.toString(), {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Cyberismo/1.0',
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

      if (!response.ok) {
        return undefined;
      }

      const json = hubVersionSchema.safeParse(await response.json());
      return json.success ? json.data.version : undefined;
    } catch (error) {
      this.logger.error(error, `Could not check hub version for ${location} }`);
      return undefined;
    }
  }

  // Fetches one hub's data as JSON.
  private async fetchJSON(
    location: string,
    schemaId: string,
  ): Promise<HubDocument> {
    try {
      const url = hubModuleListUrl(location);
      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error(
          `Invalid protocol: ${url.protocol}. Only HTTP and HTTPS are supported.`,
        );
      }

      this.logger.info(`Fetching module list from hub: ${url.toString()}`);
      const response = await egressFetch(url.toString(), {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Cyberismo/1.0',
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status}: ${response.statusText} when fetching from ${url.toString()}`,
        );
      }

      // Check content length before downloading
      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength) > MAX_RESPONSE_SIZE_MB) {
        throw new Error(
          `Response too large: ${contentLength} bytes (max: ${MAX_RESPONSE_SIZE_MB})`,
        );
      }

      const contentType = response.headers.get('content-type');
      if (!contentType?.includes('application/json')) {
        this.logger.warn(`Expected JSON response, got: ${contentType}`);
      }

      const json = await response.json();
      // Validate the incoming JSON before saving it into a file.
      await validateJson(json, { schemaId: schemaId });
      if (typeof json !== 'object' || json === null || Array.isArray(json)) {
        throw new Error('Response must be a JSON object');
      }
      if (JSON.stringify(json).length > MAX_RESPONSE_SIZE_MB) {
        throw new Error('JSON content too large after parsing');
      }

      return hubDocumentSchema.parse(json);
    } catch (error) {
      this.logger.error(
        error,
        `Failed to fetch module list from hub ${location}`,
      );
      throw error;
    }
  }

  // Checks if the local moduleList.json needs to be updated by comparing
  // each hub's version with the stored version.
  private async fetchModuleList(): Promise<boolean> {
    try {
      const configuredHubs = this.project.configuration.hubs;
      if (configuredHubs.length === 0) {
        return false;
      }

      const localData = (await readJsonFile(
        this.moduleListPath,
      )) as ModuleListFile;
      const localHubs = localData.hubs || [];
      if (localHubs.length !== configuredHubs.length) {
        this.logger.info('Hub configuration changed, fetching module list');
        return true;
      }

      // Check each hub's version
      for (const configHub of configuredHubs) {
        const localHub = localHubs.find(
          (hub) => hub.location === configHub.location,
        );

        if (!localHub) {
          this.logger.info(
            `New hub detected: ${configHub.location}, fetching module list`,
          );
          return true;
        }

        // Cache written by an older version lacks per-hub module data.
        if (!Array.isArray(localHub.modules)) {
          this.logger.info(
            `Cached data for hub ${configHub.location} is in an outdated format, fetching module list`,
          );
          return true;
        }

        const remoteVersion = await this.checkRemoteVersion(configHub.location);
        if (remoteVersion === undefined) {
          const hubName = configHub.displayName || configHub.location;
          this.logger.info(`Hub ${hubName} has no version data, skipped.`);
          continue;
        }

        if (remoteVersion > localHub.version) {
          this.logger.info(
            `Hub ${configHub.location} has newer version (remote: ${remoteVersion}, local: ${localHub.version}), fetching module list`,
          );
          return true;
        }
      }

      this.logger.info('Module list is up to date');
      return false;
    } catch (error) {
      this.logger.error(
        error,
        `Error when checking versions for hub module list`,
      );
      return true;
    }
  }

  /**
   * Ensures the module list is up to date by fetching if needed.
   * @returns the hubs that could not be read.
   */
  @write()
  public async ensureModuleListUpToDate(): Promise<HubFetchFailure[]> {
    return this.fetchHubs();
  }

  /**
   * Fetches hub data only when no local cache exists yet.
   *
   * Unlike 'ensureModuleListUpToDate' this never contacts a hub when the cache
   * is present, so callers that only display cached data (and offer an explicit
   * refresh) can populate it once without paying a version check per read.
   */
  @write()
  public async ensureModuleListExists() {
    if (existsSync(this.moduleListPath)) {
      return;
    }
    await this.fetchHubs(true);
  }

  // Flat view of the modules of the given hubs, deduplicated by module name.
  // The first hub offering a name wins, so hub order is precedence order.
  private static mergedModules(hubs: CachedHub[]): ModuleSetting[] {
    const moduleMap: Map<string, ModuleSetting> = new Map();
    for (const hub of hubs) {
      for (const module of hub.modules ?? []) {
        if (!moduleMap.has(module.name)) {
          moduleMap.set(module.name, module);
        }
      }
    }
    return Array.from(moduleMap.values());
  }

  /**
   * Drops cached data of hubs that are no longer configured.
   *
   * No hub is contacted: the flat module list is recomputed from what stays
   * cached, so a removed hub's modules stop being offered at once instead of
   * only at the next fetch. A missing or unreadable cache is not an error,
   * since nothing can then be offering them either.
   */
  @write()
  public async pruneUnconfiguredHubs() {
    let cached: ModuleListFile | undefined;
    try {
      cached = (await readJsonFile(this.moduleListPath)) as ModuleListFile;
    } catch (error) {
      this.logger.info(error, 'Not pruning hub cache: no readable module list');
      return;
    }
    if (!Array.isArray(cached?.hubs)) {
      return;
    }

    // Matching against what remains configured rather than against the removed
    // location: a hub can be removed by any spelling of its location, but the
    // entries left in the configuration are exactly the ones worth keeping.
    const configured = new Set(
      this.project.configuration.hubs.map((hub) =>
        canonicalHubLocation(hub.location),
      ),
    );
    const hubs = cached.hubs.filter((hub) =>
      configured.has(canonicalHubLocation(hub.location)),
    );
    if (hubs.length === cached.hubs.length) {
      return;
    }

    await writeJsonFile(this.moduleListPath, {
      modules: Fetch.mergedModules(hubs),
      hubs,
    });
    this.logger.info(
      `Pruned data of unconfigured hubs from: ${this.moduleListPath}`,
    );
  }

  // Hubs already fetched successfully at some point, by location.
  private async cachedHubs(): Promise<Map<string, CachedHub>> {
    try {
      const localData = (await readJsonFile(
        this.moduleListPath,
      )) as ModuleListFile;
      return new Map(
        (localData.hubs ?? [])
          .filter((hub) => Array.isArray(hub.modules))
          .map((hub) => [hub.location, hub]),
      );
    } catch (error) {
      this.logger.info(
        error,
        'No readable module list; fetching without cached fallbacks',
      );
      return new Map();
    }
  }

  /**
   * Fetches modules from modules hub(s) and writes them to a file.
   * Only fetches if the remote version is newer than the local version,
   * unless 'force' is set.
   *
   * A hub that cannot be read is reported rather than thrown: one unreachable
   * hub must not stop the others from being refreshed, nor block the module
   * operations that refresh the list on their way to doing something else.
   * Its previously cached modules are kept so it degrades to stale, not gone.
   * @param force Fetch hubs even if the cached data is up to date.
   * @returns the hubs that could not be read, in configuration order.
   */
  @write(() => 'Fetch hubs')
  public async fetchHubs(force: boolean = false): Promise<HubFetchFailure[]> {
    if (!force) {
      const needsFetch = await this.fetchModuleList();
      if (!needsFetch) {
        return [];
      }
    }

    const hubs = this.project.configuration.hubs;
    const cachedHubs: CachedHub[] = [];
    const failures: HubFetchFailure[] = [];
    const previous = await this.cachedHubs();

    for (const hub of hubs) {
      try {
        const json = await this.fetchJSON(hub.location, HUB_SCHEMA);
        cachedHubs.push({
          location: hub.location,
          version: json.version || 1,
          displayName: json.displayName,
          description: json.description,
          modules: json.modules || [],
        });
      } catch (error) {
        failures.push({
          location: hub.location,
          message: error instanceof Error ? error.message : String(error),
        });
        const stale = previous.get(hub.location);
        if (stale) {
          cachedHubs.push(stale);
        }
      }
    }

    try {
      const normalizedBasePath = resolve(this.project.basePath);
      if (
        !this.moduleListPath.startsWith(normalizedBasePath + sep) &&
        this.moduleListPath !== normalizedBasePath
      ) {
        throw new Error(
          'Invalid file path: attempting to write outside project directory',
        );
      }

      await mkdir(resolve(this.project.basePath, TEMP_FOLDER), {
        recursive: true,
      });
      await writeJsonFile(this.moduleListPath, {
        modules: Fetch.mergedModules(cachedHubs),
        hubs: cachedHubs,
      });
      this.logger.info(`Module list written to: ${this.moduleListPath}`);
    } catch (error) {
      this.logger.error(error, `Failed to write module list to local file`);
      throw error;
    }

    return failures;
  }
}
