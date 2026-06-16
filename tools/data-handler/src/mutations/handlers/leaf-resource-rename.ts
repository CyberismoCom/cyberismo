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

import type { Handler, MutationContext } from '../handler.js';
import type { RenameInput } from '../types.js';
import { resourceNameToString } from '../../utils/resource-utils.js';
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
  | 'templates';

/**
 * Renames a leaf resource (calculation, report, graph model, graph view or
 * template). The handler performs the reference cascade itself, rewriting
 * references to the old name across folder-resource content files and card
 * content before renaming the resource on disk. The operation is marked
 * breaking so a log entry is recorded.
 *
 * The rewrites are name-based string replacements applied to every local
 * folder resource's content files — the extra scans are harmless no-ops where
 * a file never carried such references.
 *
 * Renaming a template does not flush the template-card cache (only deletion
 * does).
 */
export class LeafResourceRenameHandler implements Handler<RenameInput> {
  constructor(
    private readonly type: LeafResourceType,
    private readonly label: string,
  ) {}

  async apply(ctx: MutationContext<RenameInput>): Promise<void> {
    const oldName = resourceNameToString(ctx.input.target);

    // Interactive rename of a module-owned resource is not allowed.
    if (ctx.input.target.prefix !== ctx.project.projectPrefix) {
      throw new Error(
        `Cannot rename resource ${oldName}: It is a module resource`,
      );
    }

    const resource = ctx.project.resources.byType(oldName, this.type);
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

    await rewriteContentFileRefs(ctx.project, oldName, newName);
    await rewriteCardContentRefs(ctx.project, oldName, newName);
  }
}
