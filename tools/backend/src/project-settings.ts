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
 * Settings of a running project, kept out of the project's own configuration:
 * '.cyberismo' is gitignored and outside the folders the autocommit stages, so
 * nothing here reaches a commit or a rollback. Loose so that keys this version
 * does not know about survive an update of the ones it does.
 */
export const projectSettingsSchema = z.looseObject({
  readOnlyMode: z.boolean().optional(),
});

export type ProjectSettings = z.infer<typeof projectSettingsSchema>;

export function projectSettingsFile(projectPath: string): string {
  return join(projectPath, '.cyberismo', 'project.json');
}

/** A missing or broken file reads as no settings, so a project always loads. */
export function readProjectSettings(file: string): ProjectSettings {
  try {
    const parsed = projectSettingsSchema.safeParse(
      JSON.parse(readFileSync(file, 'utf-8')),
    );
    if (parsed.success) {
      return parsed.data;
    }
    console.error(`Ignoring invalid project settings in '${file}'`);
  } catch {
    // Nothing to read, or not JSON.
  }
  return {};
}

export function writeProjectSettings(
  file: string,
  settings: ProjectSettings,
): void {
  mkdirSync(dirname(file), { recursive: true });
  // Rename so that a crash partway through leaves the previous file rather than
  // a truncated one, which would read as no settings.
  const tempFile = `${file}.tmp`;
  writeFileSync(tempFile, `${JSON.stringify(settings, null, 2)}\n`);
  renameSync(tempFile, file);
}
