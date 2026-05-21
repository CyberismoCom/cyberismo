// tools/data-handler/src/mutations/plan.ts

import type { Project } from '../containers/project.js';
import { computeFingerprint } from './fingerprint.js';
import { dispatch } from './dispatcher.js';
import type { Handler, MutationContext } from './handler.js';
import type {
  ApplyOptions,
  ApplyResult,
  MutationInput,
  PreviewResult,
} from './types.js';
import { ConfigurationLogger } from '../utils/configuration-logger.js';

interface RecordContext {
  oldPrefix?: string;
}

export class ResourceMutations {
  constructor(private project: Project) {}

  async plan(input: MutationInput): Promise<PreviewResult> {
    const ctx: MutationContext = { project: this.project, input };
    const handler = dispatch(ctx);
    const preview = await handler.preview(ctx);
    const affectedPaths = await this.affectedFilePathsFor(ctx, handler);
    const fingerprint = await computeFingerprint(input, affectedPaths);

    return {
      input,
      isBreaking: handler.isBreaking,
      preview,
      fingerprint,
    };
  }

  async apply(input: MutationInput, options: ApplyOptions = {}): Promise<ApplyResult> {
    const ctx: MutationContext = { project: this.project, input };
    const handler = dispatch(ctx);
    const preview = await handler.preview(ctx);
    const needsConfirm =
      handler.isBreaking &&
      (preview.affectedCardCount > 0 ||
        preview.affectedLinkCount > 0 ||
        preview.dataLossExpected);

    if (needsConfirm) {
      if (!options.fingerprint) {
        throw new Error('Mutation has cascade effects; fingerprint required');
      }
      const affectedPaths = await this.affectedFilePathsFor(ctx, handler);
      const current = await computeFingerprint(input, affectedPaths);
      if (current.digest !== options.fingerprint.digest) {
        throw new Error('Stale fingerprint; re-preview before retrying');
      }
    }

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
    return { success: true };
  }

  private async affectedFilePathsFor(
    ctx: MutationContext,
    handler: Handler,
  ): Promise<string[]> {
    return handler.affectedFilePaths(ctx);
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
        throw new Error(
          'project_rename log entry requires oldPrefix context',
        );
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
