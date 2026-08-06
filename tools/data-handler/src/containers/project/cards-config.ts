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

import { readJsonFile, readJsonFileSync } from '../../utils/json.js';

import type { ProjectSettings } from '../../interfaces/project-interfaces.js';

/**
 * Filesystem-safe component: alphanumerics, underscore and hyphen, starting
 * with an alphanumeric. Rejects path separators, `.`, `..`, null bytes, and
 * anything else that could escape a join() when the value is used as a
 * path fragment (a `cardKeyPrefix` for a project, or a child module name).
 */
const SAFE_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

function assertSafeName(name: string): void {
  if (typeof name !== 'string' || !SAFE_NAME_PATTERN.test(name)) {
    throw new Error(
      `Invalid name '${name}': must match ${SAFE_NAME_PATTERN.source}`,
    );
  }
}

/**
 * Shared reader for any `cardsConfig.json` — the project's own, an installed
 * module's, or a freshly fetched module's. The on-disk shape is identical
 * across all three; only the write semantics differ (only the project's
 * own config is mutable, via `ProjectConfiguration`).
 *
 * Enforces the universal contract: `cardKeyPrefix` and `name` must be
 * present, and any name (including child module names) must be a
 * filesystem-safe component so the value can be trusted as a path fragment.
 *
 * Callers pass the explicit path to `cardsConfig.json` because the file's
 * location relative to a project root differs by context: the project's
 * own and fetched-module copies live under `.cards/local/`, while
 * installed modules have it directly under `.cards/modules/<name>/`.
 *
 * @throws if the file is missing, empty, or not valid JSON; if `cardKeyPrefix`
 *         or `name` is missing; or if any name fails the safe-name check.
 */
export async function readCardsConfig(
  configPath: string,
): Promise<ProjectSettings> {
  const settings = (await readJsonFile(configPath)) as
    | ProjectSettings
    | undefined;
  return validate(settings, configPath);
}

/** Synchronous variant of {@link readCardsConfig}. */
export function readCardsConfigSync(configPath: string): ProjectSettings {
  const settings = readJsonFileSync(configPath) as ProjectSettings | undefined;
  return validate(settings, configPath);
}

function validate(
  settings: ProjectSettings | undefined,
  configPath: string,
): ProjectSettings {
  if (!settings) {
    throw new Error(`File at '${configPath}' is not a valid JSON file`);
  }
  if (!settings.cardKeyPrefix || !settings.name) {
    throw new Error(
      `Configuration file '${configPath}' is missing required 'cardKeyPrefix' or 'name'`,
    );
  }
  assertSafeName(settings.cardKeyPrefix);
  for (const child of settings.modules ?? []) {
    if (child.name) {
      assertSafeName(child.name);
    }
  }
  return settings;
}
