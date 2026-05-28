// tools/data-handler/src/mutations/handlers/workflow-rename.ts

import { basename, dirname, join } from 'node:path';
import { readFile } from 'node:fs/promises';

import type { Handler, MutationContext } from '../handler.js';
import type { CascadePreview } from '../types.js';
import {
  resourceName,
  resourceNameToString,
} from '../../utils/resource-utils.js';
import type { ChangeOperation } from '../../resources/resource-object.js';
import {
  rewriteCalculationRefs,
  rewriteHandlebarRefs,
  rewriteCardContentRefs,
} from '../cascades/rewrite-refs.js';
import { ResourcesFrom } from '../../containers/project/resources-from.js';

export class WorkflowRenameHandler implements Handler {
  readonly isBreaking = true;

  matches(ctx: MutationContext): boolean {
    return (
      ctx.input.kind === 'rename' && ctx.input.target.type === 'workflows'
    );
  }

  async preview(ctx: MutationContext): Promise<CascadePreview> {
    if (ctx.input.kind !== 'rename') {
      throw new Error('WorkflowRenameHandler called with non-rename input');
    }
    const oldName = resourceNameToString(ctx.input.target);
    const dependentCardTypes = this.dependentCardTypes(ctx, oldName);
    const calculationFiles = await this.calculationFilesReferencing(
      ctx,
      oldName,
    );
    const handlebarFiles = await this.handlebarFilesReferencing(ctx, oldName);
    return {
      affectedCardCount: 0,
      affectedLinkCount: 0,
      affectedCalculationCount: calculationFiles.length,
      affectedHandlebarFileCount: handlebarFiles.length,
      dataLossExpected: false,
      summary: `Renames workflow in ${dependentCardTypes.length} card type(s); updates ${calculationFiles.length} calculation file(s) and ${handlebarFiles.length} handlebar file(s).`,
    };
  }

  async applyCascade(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'rename') {
      throw new Error('WorkflowRenameHandler called with non-rename input');
    }
    const oldName = resourceNameToString(ctx.input.target);
    const newName = `${ctx.input.target.prefix}/workflows/${ctx.input.newIdentifier}`;

    // Rewrite local card types' workflow reference.
    const dependentCardTypes = this.dependentCardTypes(ctx, oldName);
    for (const ct of dependentCardTypes) {
      const op: ChangeOperation<string> = {
        name: 'change',
        target: oldName,
        to: newName,
      };
      await ct.update({ key: 'workflow' }, op);
    }

    // Rewrite cross-resource references (calculations, handlebars, card content).
    await rewriteCalculationRefs(ctx.project, oldName, newName);
    await rewriteHandlebarRefs(ctx.project, oldName, newName);
    await rewriteCardContentRefs(ctx.project, oldName, newName);
  }

  async applyResourceOp(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'rename') {
      throw new Error('WorkflowRenameHandler called with non-rename input');
    }
    const oldName = resourceNameToString(ctx.input.target);
    const newName = `${ctx.input.target.prefix}/workflows/${ctx.input.newIdentifier}`;

    const resource = ctx.project.resources.byType(oldName, 'workflows');
    if (!resource) {
      throw new Error(`Workflow '${oldName}' not found`);
    }
    await resource.rename(resourceName(newName));
  }

  async affectedFilePaths(ctx: MutationContext): Promise<string[]> {
    if (ctx.input.kind !== 'rename') return [];
    const oldName = resourceNameToString(ctx.input.target);
    const paths: string[] = [];
    for (const ct of this.dependentCardTypes(ctx, oldName)) {
      paths.push(ct.fileName);
    }
    paths.push(...(await this.calculationFilesReferencing(ctx, oldName)));
    paths.push(...(await this.handlebarFilesReferencing(ctx, oldName)));
    return paths.filter((p) => p && p.length > 0);
  }

  private dependentCardTypes(ctx: MutationContext, workflowName: string) {
    return ctx.project.resources
      .cardTypes(ResourcesFrom.localOnly)
      .filter((ct) => ct.data?.workflow === workflowName);
  }

  /**
   * Scan every calculation file under the project for occurrences of the old
   * workflow name. Returns absolute paths. The actual text rewrite lives in
   * `rewriteCalculationRefs` (mutations/cascades/rewrite-refs).
   */
  private async calculationFilesReferencing(
    ctx: MutationContext,
    workflowName: string,
  ): Promise<string[]> {
    const calculations = ctx.project.resources.calculations();
    const paths: string[] = [];
    for (const calc of calculations) {
      const content = calc.contentData();
      if (content.calculation?.includes(workflowName)) {
        const calcFolder = join(
          dirname(calc.fileName),
          basename(calc.fileName, '.json'),
        );
        paths.push(join(calcFolder, 'calculation.lp'));
      }
    }
    return paths;
  }

  private async handlebarFilesReferencing(
    ctx: MutationContext,
    workflowName: string,
  ): Promise<string[]> {
    const reports = ctx.project.resources.reports();
    const paths: string[] = [];
    for (const report of reports) {
      const files = await report.handleBarFiles();
      for (const file of files) {
        const content = await readFile(file, 'utf-8');
        if (content.includes(workflowName)) {
          paths.push(file);
        }
      }
    }
    return paths;
  }
}
