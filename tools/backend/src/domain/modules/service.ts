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
import { ModuleUpdate } from '@cyberismo/data-handler';
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
  const updater = new ModuleUpdate(commands.project);
  return updater.preview(modulePrefix, toVersion);
}

export async function applyModuleUpdate(
  commands: CommandManager,
  preview: ModuleUpdatePreview,
): Promise<ModuleUpdateResult> {
  const updater = new ModuleUpdate(commands.project);
  return updater.apply(preview);
}
