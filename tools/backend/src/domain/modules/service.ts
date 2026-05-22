/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/
import type { CommandManager } from '@cyberismo/data-handler';
import type {
  ModuleUpdatePreview,
  ModuleUpdateResult,
} from '@cyberismo/data-handler/mutations/module-update/types';

export async function previewModuleUpdate(
  commands: CommandManager,
  modulePrefix: string,
  toVersion: string,
): Promise<ModuleUpdatePreview> {
  return commands.importCmd.previewUpdate(modulePrefix, toVersion);
}

/**
 * Run install+replay for `modulePrefix` up to `toVersion`. Routes through
 * `Import.updateModule`, which owns the install half (resolveModules +
 * applyModules) and then invokes the replay. `Import.updateModule`
 * captures `fromVersion` in-memory before install, so the migration plan
 * stays correct even after the on-disk version is overwritten.
 *
 * Returns a single-step `ModuleUpdateResult`-shaped value synthesized from
 * the caller's preview so the SSE consumer keeps its current event shape;
 * on conflict, `Import.updateModule` throws and the caller surfaces it.
 */
export async function applyModuleUpdate(
  commands: CommandManager,
  preview: ModuleUpdatePreview,
  modulePrefix: string,
  toVersion: string,
): Promise<ModuleUpdateResult> {
  await commands.importCmd.updateModule(modulePrefix, undefined, toVersion);
  return {
    status: 'succeeded',
    steps: preview.steps.map((step) => ({
      modulePrefix: step.modulePrefix,
      fromVersion: step.fromVersion,
      toVersion: step.toVersion,
      status: 'succeeded' as const,
    })),
  };
}
