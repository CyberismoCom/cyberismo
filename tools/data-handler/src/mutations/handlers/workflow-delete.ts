// tools/data-handler/src/mutations/handlers/workflow-delete.ts

import type { Handler, MutationContext } from '../handler.js';
import type { CascadePreview } from '../types.js';
import {
  resourceName,
  resourceNameToString,
} from '../../utils/resource-utils.js';
import { ResourcesFrom } from '../../containers/project/resources-from.js';
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

  /**
   * Cascade: clean up local consumers of every LOCAL card type that uses
   * this workflow. For each local card type, calls both `inner.applyCascade`
   * (card/link cleanup) AND `inner.applyResourceOp` (delete the card-type file
   * itself). This is safe because we only iterate `ResourcesFrom.localOnly`
   * card types — all are local by construction.
   *
   * This runs for both local and foreign workflow deletes (replay), ensuring
   * that any LOCAL card type whose workflow has been deleted is also removed,
   * regardless of whether the workflow itself is local or foreign.
   */
  async applyCascade(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'delete') {
      throw new Error('WorkflowDeleteHandler: non-delete input');
    }
    const wfName = resourceNameToString(ctx.input.target);

    // Only local card types — foreign card types belong to a module and their
    // consumers will be handled when that module's card-type-delete is replayed.
    const localCardTypes = ctx.project.resources
      .cardTypes(ResourcesFrom.localOnly)
      .filter((ct) => ct.data?.workflow === wfName);

    const inner = new CardTypeDeleteHandler();
    for (const ct of localCardTypes) {
      const innerCtx = {
        project: ctx.project,
        input: {
          kind: 'delete' as const,
          target: resourceName(ct.data!.name),
        },
      };
      // First, clean up consumers (cards, link-type refs).
      await inner.applyCascade(innerCtx);
      // Then, delete the local card-type file itself. Safe: it's local.
      await inner.applyResourceOp(innerCtx);
    }
  }

  /**
   * Resource-op: delete the workflow itself.
   * Only called when the workflow is local (target.prefix === projectPrefix).
   * By this point, applyCascade has already deleted all local card types that
   * used this workflow (and their cards).
   */
  async applyResourceOp(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'delete') {
      throw new Error('WorkflowDeleteHandler: non-delete input');
    }
    const wfName = resourceNameToString(ctx.input.target);

    // Delete the workflow resource itself. `usage()` is now empty because
    // applyCascade has already removed all local card types that referenced it.
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
