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

import { mkdir } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

import { getChildLogger } from '../utils/log-utils.js';
import { readJsonFile, writeJsonFile } from '../utils/json.js';
import { validateJson } from '../utils/validate.js';

import type { ModuleSetting } from '../interfaces/project-interfaces.js';
import type { Project } from '../containers/project.js';

// Hub structure
interface HubVersionInfo {
  location: string;
  version: number;
}

// Structure of .temp/moduleList.json file.
interface ModuleListFile {
  modules: ModuleSetting[];
  hubs: HubVersionInfo[];
}

const FETCH_TIMEOUT_MS = 30 * 1000; // 30s timeout for fetching a hub file.
const MAX_RESPONSE_SIZE_MB = 1024 * 1024; // 1MB limit for safety
const HUB_SCHEMA = 'hubSchema';
const MODULE_LIST_FILE = 'moduleList.json';
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
      const url = new URL(`${location}/${MODULE_LIST_FILE}`);
      if (!['http:', 'https:'].includes(url.protocol)) {
        return undefined;
      }

      const response = await fetch(url.toString(), {
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

      const json = await response.json();
      return json.version;
    } catch (error) {
      this.logger.error(error, `Could not check hub version for ${location} }`);
      return undefined;
    }
  }

  // Fetches one hub's data as JSON.
  private async fetchJSON(location: string, schemaId: string) {
    try {
      const url = new URL(`${location}/${MODULE_LIST_FILE}`);
      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error(
          `Invalid protocol: ${url.protocol}. Only HTTP and HTTPS are supported.`,
        );
      }

      this.logger.info(`Fetching module list from hub: ${url.toString()}`);
      const response = await fetch(url.toString(), {
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

      return json;
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
   */
  public async ensureModuleListUpToDate() {
    const needsFetch = await this.fetchModuleList();
    if (needsFetch) {
      await this.fetchHubs(true);
    }
  }

  /**
   * Fetches modules from modules hub(s) and writes them to a file.
   * @param skipVersionCheck - If true, skips hub version check and forces fetch
   */
  public async fetchHubs(skipVersionCheck: boolean = false) {
    if (!skipVersionCheck) {
      const needsFetch = await this.fetchModuleList();
      if (!needsFetch) {
        return;
      }
    }

    const hubs = this.project.configuration.hubs;
    const moduleMap: Map<string, ModuleSetting> = new Map([]);
    const hubVersions: HubVersionInfo[] = [];

    for (const hub of hubs) {
      const json = await this.fetchJSON(hub.location, HUB_SCHEMA);
      json.modules.forEach((module: ModuleSetting) => {
        if (!moduleMap.has(module.name)) {
          moduleMap.set(module.name, module);
        }
      });

      hubVersions.push({
        location: hub.location,
        version: json.version || 1,
      });
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
        modules: Array.from(moduleMap.values()),
        hubs: hubVersions,
      });
      this.logger.info(`Module list written to: ${this.moduleListPath}`);
    } catch (error) {
      this.logger.error(error, `Failed to write module list to local file`);
      throw error;
    }
  }
}
