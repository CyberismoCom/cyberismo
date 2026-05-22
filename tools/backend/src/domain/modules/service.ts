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
import type { ModuleUpdateResult } from '@cyberismo/data-handler/mutations/module-update/types';

/**
 * Run install + migration replay for `modulePrefix` up to `toVersion`.
 * Delegates to `Import.updateModule`, which owns the install half
 * (resolveModules + applyModules) and then drives the replay batch for
 * every module whose version changed.
 *
 * Returns `null` when the resolver produced no version changes (no-op).
 * On a replay conflict `Import.updateModule` throws; the caller surfaces
 * the error.
 */
export async function applyModuleUpdate(
  commands: CommandManager,
  modulePrefix: string,
  toVersion: string,
): Promise<ModuleUpdateResult | null> {
  return commands.importCmd.updateModule(modulePrefix, undefined, toVersion);
}
