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

import type { Project } from '../containers/project.js';
import { dispatch } from './dispatcher.js';
import type { MutationContext } from './handler.js';
import type { MutationInput } from './types.js';
import { ConfigurationLogger } from '../utils/configuration-logger.js';

interface RecordContext {
  oldPrefix?: string;
}

export class ResourceMutations {
  constructor(private project: Project) {}

  async apply(input: MutationInput): Promise<void> {
    const ctx: MutationContext = { project: this.project, input };
    const handler = dispatch(ctx);

    // Capture extras the log entry depends on BEFORE the cascade mutates state.
    const recordContext: RecordContext = {};
    if (input.kind === 'project_rename') {
      recordContext.oldPrefix = this.project.projectPrefix;
    }

    await this.project.lock.write(async () => {
      await handler.apply(ctx);
      if (handler.isBreaking) {
        await this.recordLogEntry(input, recordContext);
      }
    });
  }

  private async recordLogEntry(
    input: MutationInput,
    context: RecordContext = {},
  ): Promise<void> {
    if (input.kind === 'edit') {
      await ConfigurationLogger.log(this.project.basePath, {
        kind: 'resource_edit',
        target: `${input.target.prefix}/${input.target.type}/${input.target.identifier}`,
        payload: { operation: input.operation, key: input.updateKey.key },
      });
    } else if (input.kind === 'delete') {
      await ConfigurationLogger.log(this.project.basePath, {
        kind: 'resource_delete',
        target: `${input.target.prefix}/${input.target.type}/${input.target.identifier}`,
        payload: { type: input.target.type },
      });
    } else if (input.kind === 'rename') {
      await ConfigurationLogger.log(this.project.basePath, {
        kind: 'resource_rename',
        target: `${input.target.prefix}/${input.target.type}/${input.target.identifier}`,
        payload: { type: input.target.type, newName: input.newIdentifier },
      });
    } else if (input.kind === 'project_rename') {
      if (!context.oldPrefix) {
        throw new Error('project_rename log entry requires oldPrefix context');
      }
      await ConfigurationLogger.log(this.project.basePath, {
        kind: 'project_rename',
        target: input.newPrefix,
        payload: {
          oldPrefix: context.oldPrefix,
          newPrefix: input.newPrefix,
        },
      });
    }
  }
}
