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

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { z } from 'zod';

/**
 * Folder inside a project for state that belongs to the deployment rather than
 * to the project: gitignored, outside the folders the autocommit stages, and
 * untouched by a rollback.
 */
export const DEPLOYMENT_FOLDER = '.cyberismo';

/** Path of a project's deployment settings file. */
export function deploymentSettingsFile(projectPath: string): string {
  return join(projectPath, DEPLOYMENT_FOLDER, 'project.json');
}

export const readOnlySettingsSchema = z.object({
  enabled: z.boolean(),
  message: z.string().optional(),
});

/**
 * Settings that belong to one deployment of a project rather than to the
 * project itself: an admin turns them on here and they stay here.
 *
 * They live in a file under the project's '.cyberismo' folder, which is
 * gitignored and outside the two directories the autocommit stages, so nothing
 * written here ever reaches a commit or gets reverted by a rollback.
 *
 * The object is loose so that keys this version does not know about survive a
 * read-modify-write: a newer build, or a hand-written key, must not be dropped
 * by an unrelated update.
 */
export const deploymentSettingsSchema = z.looseObject({
  readOnly: readOnlySettingsSchema.optional(),
});

export type DeploymentSettings = z.infer<typeof deploymentSettingsSchema>;

/** Deployment settings with every field the API promises filled in. */
export type EffectiveDeploymentSettings = {
  readOnly: z.infer<typeof readOnlySettingsSchema>;
};

/**
 * Read the stored settings, or an empty object when there is nothing usable to
 * read. A missing file is the normal case, and a corrupt one must not stop the
 * server from starting — the worst case is a project coming up with defaults,
 * which an admin can set again.
 */
export function readDeploymentSettings(file: string): DeploymentSettings {
  let contents: string;
  try {
    contents = readFileSync(file, 'utf-8');
  } catch {
    return {};
  }

  try {
    const parsed = deploymentSettingsSchema.safeParse(JSON.parse(contents));
    if (parsed.success) {
      return parsed.data;
    }
    console.error(`Ignoring invalid deployment settings in '${file}'`);
  } catch {
    console.error(`Ignoring unreadable deployment settings in '${file}'`);
  }
  return {};
}

/**
 * Write the settings via a temporary file and a rename, so that a crash partway
 * through leaves the previous file intact instead of a truncated one that would
 * read as 'no settings'.
 */
export function writeDeploymentSettings(
  file: string,
  settings: DeploymentSettings,
): void {
  mkdirSync(dirname(file), { recursive: true });
  const tempFile = `${file}.tmp`;
  writeFileSync(tempFile, `${JSON.stringify(settings, null, 2)}\n`);
  renameSync(tempFile, file);
}

/** Fill in the defaults for what the stored file leaves out. */
export function effectiveDeploymentSettings(
  settings: DeploymentSettings,
): EffectiveDeploymentSettings {
  return {
    readOnly: { enabled: false, ...settings.readOnly },
  };
}
