// tools/data-handler/src/mutations/handlers/calculation.ts

import type { Handler, MutationContext } from '../handler.js';
import type { CascadePreview } from '../types.js';
import { resourceName, resourceNameToString } from '../../utils/resource-utils.js';
import { ResourcesFrom } from '../../containers/project/resources-from.js';
import {
  rewriteCalculationRefs,
  rewriteCardContentRefs,
} from '../cascades/rewrite-refs.js';

export class CalculationRenameHandler implements Handler {
  readonly isBreaking = true;

  matches(ctx: MutationContext): boolean {
    return (
      ctx.input.kind === 'rename' &&
      ctx.input.target.type === 'calculations'
    );
  }

  async preview(ctx: MutationContext): Promise<CascadePreview> {
    if (ctx.input.kind !== 'rename') {
      throw new Error('CalculationRenameHandler: non-rename input');
    }
    const oldName = resourceNameToString(ctx.input.target);

    // Count card types whose customFields reference this calculation.
    const cardTypes = ctx.project.resources.cardTypes(
      ResourcesFrom.localOnly,
    );
    let affectedCardTypes = 0;
    for (const ct of cardTypes) {
      const refs = (ct.data?.customFields ?? []).filter(
        (f) => f.isCalculated && f.name === oldName,
      );
      if (refs.length > 0) affectedCardTypes++;
    }

    // Count other calculation files whose .lp content imports this name.
    const others = ctx.project.resources
      .calculations(ResourcesFrom.localOnly)
      .filter((c) => c.contentData()?.calculation?.includes(oldName));

    return {
      affectedCardCount: 0,
      affectedLinkCount: 0,
      affectedCalculationCount: others.length,
      affectedHandlebarFileCount: 0,
      dataLossExpected: false,
      summary: `Renames ${affectedCardTypes} card-type references and ${others.length} calculation imports.`,
    };
  }

  async apply(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'rename') {
      throw new Error('CalculationRenameHandler: non-rename input');
    }
    const oldName = resourceNameToString(ctx.input.target);
    const resource = ctx.project.resources.byType(oldName, 'calculations');
    if (!resource) {
      throw new Error(`Calculation '${oldName}' not found`);
    }
    const newName = `${ctx.input.target.prefix}/calculations/${ctx.input.newIdentifier}`;
    // Run the cascade before the rename so the scan still finds the old
    // name on disk. Mirrors CalculationResource.onNameChange (no handlebar
    // pass — calculations don't have handlebar references).
    // TODO: compute accurate counts now that cascade is explicit
    await rewriteCalculationRefs(ctx.project, oldName, newName);
    await rewriteCardContentRefs(ctx.project, oldName, newName);
    await resource.rename(resourceName(newName));
  }

  async affectedFilePaths(ctx: MutationContext): Promise<string[]> {
    if (ctx.input.kind !== 'rename') return [];
    const oldName = resourceNameToString(ctx.input.target);
    const paths: string[] = [];
    for (const c of ctx.project.resources.calculations(
      ResourcesFrom.localOnly,
    )) {
      if (c.contentData()?.calculation?.includes(oldName)) {
        paths.push(c.fileName);
      }
    }
    return paths;
  }
}

/**
 * Delete a calculation. Per the plan: no migration (recalculation
 * happens automatically). The handler only deletes the resource and
 * records the log entry.
 */
export class CalculationDeleteHandler implements Handler {
  readonly isBreaking = true;

  matches(ctx: MutationContext): boolean {
    return (
      ctx.input.kind === 'delete' &&
      ctx.input.target.type === 'calculations'
    );
  }

  async preview(): Promise<CascadePreview> {
    return {
      affectedCardCount: 0,
      affectedLinkCount: 0,
      affectedCalculationCount: 0,
      affectedHandlebarFileCount: 0,
      dataLossExpected: false,
      summary: 'No cascade. Recalculation will pick up the missing file.',
    };
  }

  async apply(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'delete') {
      throw new Error('CalculationDeleteHandler: non-delete input');
    }
    const name = resourceNameToString(ctx.input.target);
    const resource = ctx.project.resources.byType(name, 'calculations');
    if (!resource) {
      throw new Error(`Calculation '${name}' not found`);
    }
    await resource.delete();
  }

  async affectedFilePaths(): Promise<string[]> {
    return [];
  }
}
