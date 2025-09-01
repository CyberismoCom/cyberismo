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
import { resolve } from 'node:path';
import type { Project } from '../containers/project.js';

import { writeJsonFile } from '../utils/json.js';
import { validateJson } from '../utils/validate.js';
import { type ModuleSetting } from '../interfaces/project-interfaces.js';
import { errorFunction, getChildLogger } from '../utils/log-utils.js';

const FETCH_TIMEOUT = 30000; // 30s timeout for fetching a module hub file.
const HUB_SCHEMA = 'hubSchema';
const MODULE_LIST_FILE = 'moduleList.json';
const TEMP_FOLDER = `.temp`;

export const MODULE_LIST_FULL_PATH = `${TEMP_FOLDER}/${MODULE_LIST_FILE}`;

export class Fetch {
  constructor(private project: Project) {}

  private get logger() {
    return getChildLogger({
      module: 'fetch',
    });
  }

  private async fetchJSONFile(location: string) {
    try {
      const url = new URL(`${location}/${MODULE_LIST_FILE}`);
      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error(
          `Invalid protocol: ${url.protocol}. Only HTTP and HTTPS are supported.`,
        );
      }

      this.logger.info(`Fetching module list from: ${url.toString()}`);
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Cyberismo/1.0',
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT),
      });

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status}: ${response.statusText} when fetching from ${url.toString()}`,
        );
      }

      const contentType = response.headers.get('content-type');
      if (!contentType?.includes('application/json')) {
        this.logger.warn(`Expected JSON response, got: ${contentType}`);
      }

      return await response.json();
    } catch (error) {
      const errorMessage = `Failed to fetch module list from ${location}: ${errorFunction(error)}`;
      this.logger.error(errorMessage);
      throw new Error(errorMessage);
    }
  }

  /**
   * Fetches modules from modules hub(s) and writes them to a file.
   */
  public async fetchHubs() {
    const hubs = this.project.configuration.hubs;

    const moduleMap: Map<string, ModuleSetting> = new Map([]);

    for (const hub of hubs) {
      const json = await this.fetchJSONFile(hub.location);
      await validateJson(json, { schemaId: HUB_SCHEMA });
      json.modules.forEach((module: ModuleSetting) => {
        if (!moduleMap.has(module.name)) {
          moduleMap.set(module.name, module);
        } else {
          this.logger.info(
            `Skipping module '${module.name}' since it was already listed.`,
          );
        }
      });
    }

    try {
      const fullPath = resolve(this.project.basePath, MODULE_LIST_FULL_PATH);
      await mkdir(resolve(this.project.basePath, TEMP_FOLDER), {
        recursive: true,
      });
      await writeJsonFile(fullPath, {
        modules: Array.from(moduleMap.values()),
      });
      this.logger.info(`Module list written to: ${fullPath}`);
    } catch (error) {
      const errorMessage = `Failed to write module list to local file: ${errorFunction(error)}`;
      this.logger.error(errorMessage);
      throw new Error(errorMessage);
    }
  }
}
