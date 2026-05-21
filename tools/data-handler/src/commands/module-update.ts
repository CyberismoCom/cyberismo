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

import { ModuleUpdater } from '../mutations/module-update/plan.js';
import { runWithDefaultCommitMessage } from '../utils/commit-context.js';
import type { Project } from '../containers/project.js';
import type {
  ModuleUpdatePreview,
  ModuleUpdateResult,
} from '../mutations/module-update/types.js';

/**
 * Thin wrapper around {@link ModuleUpdater} for CLI/HTTP entry points.
 * Equivalent in shape to the other command classes (Version, Import, ...).
 */
export class ModuleUpdate {
  private updater: ModuleUpdater;

  constructor(project: Project) {
    this.updater = new ModuleUpdater(project);
  }

  async preview(
    modulePrefix: string,
    toVersion: string,
  ): Promise<ModuleUpdatePreview> {
    return this.updater.previewUpdate(modulePrefix, toVersion);
  }

  async apply(preview: ModuleUpdatePreview): Promise<ModuleUpdateResult> {
    return runWithDefaultCommitMessage('Module update', () =>
      this.updater.applyUpdate(preview),
    );
  }
}
