// tools/data-handler/src/mutations/handlers/workflow-delete.ts

import type { Handler, MutationContext } from '../handler.js';
import type { CascadePreview } from '../types.js';
import {
  resourceName,
  resourceNameToString,
} from '../../utils/resource-utils.js';
import { CardTypeDeleteHandler } from './card-type-delete.js';

export class WorkflowDeleteHandler implements Handler {
  readonly isBreaking = true;

  matches(ctx: MutationContext): boolean {
    return ctx.input.kind === 'delete' && ctx.input.target.type === 'workflows';
  }

  async preview(ctx: MutationContext): Promise<CascadePreview> {
    if (ctx.input.kind !== 'delete') {
      throw new Error('WorkflowDeleteHandler: non-delete input');
    }
    const wfName = resourceNameToString(ctx.input.target);
    const dependentCardTypes = ctx.project.resources
      .cardTypes()
      .filter((ct) => ct.data?.workflow === wfName);

    // Sum cards from every dependent card type's delete preview so we
    // surface the full impact.
    const inner = new CardTypeDeleteHandler();
    let totalCards = 0;
    let totalLinks = 0;
    for (const ct of dependentCardTypes) {
      const ctPreview = await inner.preview({
        project: ctx.project,
        input: {
          kind: 'delete',
          target: resourceName(ct.data!.name),
        },
      });
      totalCards += ctPreview.affectedCardCount;
      totalLinks += ctPreview.affectedLinkCount;
    }

    return {
      affectedCardCount: totalCards,
      affectedLinkCount: totalLinks,
      affectedCalculationCount: 0,
      affectedHandlebarFileCount: 0,
      dataLossExpected: true,
      summary:
        `Deletes workflow '${wfName}'. ${dependentCardTypes.length} card type(s) and ` +
        `${totalCards} card(s) will be deleted as a consequence.`,
    };
  }

  async apply(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'delete') {
      throw new Error('WorkflowDeleteHandler: non-delete input');
    }
    const wfName = resourceNameToString(ctx.input.target);

    // 1. Delete every dependent card type (which itself deletes its cards).
    const dependentCardTypes = ctx.project.resources
      .cardTypes()
      .filter((ct) => ct.data?.workflow === wfName);
    const inner = new CardTypeDeleteHandler();
    for (const ct of dependentCardTypes) {
      await inner.apply({
        project: ctx.project,
        input: {
          kind: 'delete',
          target: resourceName(ct.data!.name),
        },
      });
    }

    // 2. Delete the workflow resource itself. `usage()` is now empty.
    const wf = ctx.project.resources.byType(wfName, 'workflows');
    if (!wf) throw new Error(`Workflow '${wfName}' not found`);
    await wf.delete();
  }

  async affectedFilePaths(ctx: MutationContext): Promise<string[]> {
    if (ctx.input.kind !== 'delete') return [];
    const wfName = resourceNameToString(ctx.input.target);
    const dependentCardTypes = ctx.project.resources
      .cardTypes()
      .filter((ct) => ct.data?.workflow === wfName);
    const paths: string[] = [];
    const inner = new CardTypeDeleteHandler();
    for (const ct of dependentCardTypes) {
      paths.push(
        ...(await inner.affectedFilePaths({
          project: ctx.project,
          input: { kind: 'delete', target: resourceName(ct.data!.name) },
        })),
      );
    }
    return paths;
  }
}
