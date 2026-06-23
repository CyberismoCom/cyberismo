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
import type { MutationContext, MutationOrigin } from './handler.js';
import type { MutationInput } from './types.js';
import { ConfigurationLogger } from '../utils/configuration-logger.js';
import { runWithDefaultCommitMessage } from '../utils/commit-context.js';
import { resourceName, resourceNameToString } from '../utils/resource-utils.js';
import type { ChangeOperation } from '../resources/resource-object.js';

interface RecordContext {
  oldPrefix?: string;
}

// Generic edit surfaces (CLI strings, HTTP bodies) encode a rename as a
// 'change' on the 'name' key. Normalize here so handlers only ever see
// kind 'rename'.
function normalized(input: MutationInput): MutationInput {
  if (
    input.kind === 'edit' &&
    input.updateKey.key === 'name' &&
    input.operation.name === 'change'
  ) {
    const to = (input.operation as ChangeOperation<string>).to;
    return {
      kind: 'rename',
      target: input.target,
      newIdentifier: resourceName(to).identifier,
    };
  }
  return input;
}

function defaultCommitMessage(input: MutationInput): string {
  switch (input.kind) {
    case 'edit':
      return `Update ${resourceNameToString(input.target)}`;
    case 'delete':
      return `Delete ${resourceNameToString(input.target)}`;
    case 'rename':
      return `Rename ${resourceNameToString(input.target)} to ${input.newIdentifier}`;
    case 'project_rename':
      return `Rename project prefix to ${input.newPrefix}`;
  }
}

export class ResourceMutations {
  constructor(private project: Project) {}

  async apply(
    rawInput: MutationInput,
    origin: MutationOrigin = { kind: 'local' },
  ): Promise<void> {
    const input = normalized(rawInput);
    const ctx: MutationContext = { project: this.project, input };
    const { handler, breaking } = dispatch(ctx);

    if (origin.kind === 'replay') {
      // Replay applies the cascade only: the resource change is already
      // materialized by the module-file overwrite, and replayed entries
      // are never recorded in the host project's log (the host's own
      // consumers replay the module chain themselves).
      await runWithDefaultCommitMessage(defaultCommitMessage(input), () =>
        this.project.lock.write(async () => {
          await handler.applyCascade(ctx);
        }),
      );
      return;
    }

    // Capture extras the log entry depends on BEFORE the cascade mutates state.
    const recordContext: RecordContext = {};
    if (input.kind === 'project_rename') {
      recordContext.oldPrefix = this.project.projectPrefix;
    }

    await runWithDefaultCommitMessage(defaultCommitMessage(input), () =>
      this.project.lock.write(async () => {
        await handler.apply(ctx);
        if (breaking) {
          await this.recordLogEntry(input, recordContext);
        }
      }),
    );
  }

  private async recordLogEntry(
    input: MutationInput,
    context: RecordContext = {},
  ): Promise<void> {
    if (input.kind === 'edit') {
      await ConfigurationLogger.log(this.project.basePath, {
        operation: 'resource_update',
        target: `${input.target.prefix}/${input.target.type}/${input.target.identifier}`,
        parameters: {
          type: input.target.type,
          operation: input.operation,
          key: input.updateKey.key,
        },
      });
    } else if (input.kind === 'delete') {
      await ConfigurationLogger.log(this.project.basePath, {
        operation: 'resource_delete',
        target: `${input.target.prefix}/${input.target.type}/${input.target.identifier}`,
        parameters: { type: input.target.type },
      });
    } else if (input.kind === 'rename') {
      const oldName = `${input.target.prefix}/${input.target.type}/${input.target.identifier}`;
      const newName = `${input.target.prefix}/${input.target.type}/${input.newIdentifier}`;
      await ConfigurationLogger.log(this.project.basePath, {
        operation: 'resource_rename',
        target: oldName,
        parameters: {
          type: input.target.type,
          operation: { name: 'change', target: oldName, to: newName },
        },
      });
    } else if (input.kind === 'project_rename') {
      if (!context.oldPrefix) {
        throw new Error('project_rename log entry requires oldPrefix context');
      }
      await ConfigurationLogger.log(this.project.basePath, {
        operation: 'project_rename',
        target: input.newPrefix,
        parameters: {
          oldPrefix: context.oldPrefix,
          newPrefix: input.newPrefix,
        },
      });
    }
  }
}
