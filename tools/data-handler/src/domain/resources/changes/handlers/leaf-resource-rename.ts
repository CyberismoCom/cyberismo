// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { Handler, MutationContext } from '../handler.js';
import type { RenameInput } from '../types.js';
import { resourceNameToString } from '../../../../shared/utils/resource-utils.js';
import {
  rewriteCardContentRefs,
  rewriteContentFileRefs,
} from '../cascades/rewrite-refs.js';

/** Plural resource-folder types whose rename cascade lives in the handler. */
type LeafResourceType =
  | 'calculations'
  | 'reports'
  | 'graphModels'
  | 'graphViews'
  | 'skills'
  | 'templates';

/**
 * Renames a leaf resource (calculation, report, graph model, graph view,
 * skill or template). The handler performs the reference cascade itself,
 * rewriting references to the old name across folder-resource content files
 * and card content before renaming the resource on disk.
 *
 * The rewrites are name-based string replacements applied to every local
 * folder resource's content files — the extra scans are harmless no-ops where
 * a file never carried such references.
 */
export class LeafResourceRenameHandler implements Handler<RenameInput> {
  constructor(
    private readonly type: LeafResourceType,
    private readonly label: string,
  ) {}

  async apply(ctx: MutationContext<RenameInput>): Promise<void> {
    const oldName = resourceNameToString(ctx.input.target);

    // Interactive rename of a module-owned resource is not allowed.
    if (ctx.input.target.prefix !== ctx.checkout.projectPrefix) {
      throw new Error(
        `Cannot rename resource ${oldName}: It is a module resource`,
      );
    }

    const resource = ctx.checkout.resources.byType(oldName, this.type);
    if (!resource) {
      throw new Error(`${this.label} '${oldName}' not found`);
    }

    // The cascade runs BEFORE renaming the resource on disk. Order matters:
    // cascade scanners look for the old name, and the resource folder (with
    // that name) must still exist when they run.
    await this.applyCascade(ctx);

    // Rename the resource itself (renames its metadata file and, for folder
    // resources, the content folder).
    await resource.rename(ctx.input.newIdentifier);
  }

  async applyCascade(ctx: MutationContext<RenameInput>): Promise<void> {
    const oldName = resourceNameToString(ctx.input.target);
    const newName = `${ctx.input.target.prefix}/${this.type}/${ctx.input.newIdentifier}`;

    await rewriteContentFileRefs(ctx.checkout, oldName, newName);
    await rewriteCardContentRefs(ctx.checkout, oldName, newName);
  }
}
