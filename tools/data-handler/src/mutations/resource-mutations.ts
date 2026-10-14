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

import type { Checkout } from '../infra/checkout.js';
import { dispatch } from './dispatcher.js';
import type { MutationContext, MutationOrigin } from './handler.js';
import { ConfigurationLogger } from '../utils/configuration-logger.js';
import { runWithDefaultCommitMessage } from '../infra/commit-context.js';
import { resourceName, resourceNameToString } from '../utils/resource-utils.js';
import type { ChangeOperation, MutationInput } from '@cyberismo/model';

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

const createLabels: Record<string, string> = {
  calculations: 'calculation',
  cardTypes: 'card type',
  fieldTypes: 'field type',
  graphModels: 'graph model',
  graphViews: 'graph view',
  linkTypes: 'link type',
  reports: 'report',
  skills: 'skill',
  templates: 'template',
  workflows: 'workflow',
};

/** Commit subject of creating `name`, a resource of `type`. */
export function createSubject(type: string, name: string): string {
  return `Create ${createLabels[type]} ${name}`;
}

function defaultCommitMessage(input: MutationInput): string {
  switch (input.kind) {
    case 'create':
      return createSubject(
        input.target.type,
        resourceNameToString(input.target),
      );
    case 'edit':
      return `Update ${resourceNameToString(input.target)}`;
    case 'delete':
      return `Delete ${resourceNameToString(input.target)}`;
    case 'rename':
      return `Rename ${resourceNameToString(input.target)} to ${input.newIdentifier}`;
  }
}

export class ResourceMutations {
  constructor(private checkout: Checkout) {}

  async apply(
    rawInput: MutationInput,
    origin: MutationOrigin = { kind: 'local' },
  ): Promise<void> {
    const input = normalized(rawInput);
    const ctx: MutationContext = {
      checkout: this.checkout,
      input,
      cardTypeRenames:
        origin.kind === 'replay' ? origin.cardTypeRenames : undefined,
    };
    const { handler, classification } = dispatch(ctx);

    if (origin.kind === 'replay') {
      // Replay applies the cascade only: the resource change is already
      // materialized by the module-file overwrite, and replayed entries
      // are never recorded in the host project's log (the host's own
      // consumers replay the module chain themselves).
      await runWithDefaultCommitMessage(defaultCommitMessage(input), () =>
        this.checkout.lock.write(async () => {
          await handler.applyCascade(ctx);
        }),
      );
      return;
    }

    await runWithDefaultCommitMessage(defaultCommitMessage(input), () =>
      this.checkout.lock.write(async () => {
        await handler.apply(ctx);
        this.recordChange(input);
        if (classification !== 'none') {
          await this.recordLogEntry(input);
        }
      }),
    );
  }

  // Records the resources the change wrote into the running write.
  private recordChange(input: MutationInput) {
    const resources = this.checkout.lock.currentTx()?.touched.resources;
    resources?.add(resourceNameToString(input.target));
    if (input.kind === 'rename') {
      resources?.add(
        resourceNameToString({
          ...input.target,
          identifier: input.newIdentifier,
        }),
      );
    }
  }

  private async recordLogEntry(input: MutationInput): Promise<void> {
    if (input.kind === 'edit') {
      await ConfigurationLogger.log(this.checkout.basePath, {
        operation: 'resource_update',
        target: `${input.target.prefix}/${input.target.type}/${input.target.identifier}`,
        parameters: {
          type: input.target.type,
          operation: input.operation,
          key: input.updateKey.key,
        },
      });
    } else if (input.kind === 'delete') {
      await ConfigurationLogger.log(this.checkout.basePath, {
        operation: 'resource_delete',
        target: `${input.target.prefix}/${input.target.type}/${input.target.identifier}`,
        parameters: { type: input.target.type },
      });
    } else if (input.kind === 'rename') {
      const oldName = `${input.target.prefix}/${input.target.type}/${input.target.identifier}`;
      const newName = `${input.target.prefix}/${input.target.type}/${input.newIdentifier}`;
      await ConfigurationLogger.log(this.checkout.basePath, {
        operation: 'resource_rename',
        target: oldName,
        parameters: {
          type: input.target.type,
          operation: { name: 'change', target: oldName, to: newName },
        },
      });
    }
  }
}
