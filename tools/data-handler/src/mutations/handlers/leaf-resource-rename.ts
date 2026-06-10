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
import {
  resourceName,
  resourceNameToString,
} from '../../utils/resource-utils.js';
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
 * The cascade used to live in each resource's `onNameChange`; it now lives
 * here, mirroring `LinkTypeRenameHandler`. The rewrites are name-based string
 * replacements applied to every local folder resource's content files — the
 * extra scans are harmless no-ops where a file never carried such references.
 *
 * Renaming a template does not flush the template-card cache (only deletion
 * does).
 */
export class LeafResourceRenameHandler implements Handler {
  readonly isBreaking = true;

  constructor(
    private readonly type: LeafResourceType,
    private readonly label: string,
  ) {}

  matches(ctx: MutationContext): boolean {
    return ctx.input.kind === 'rename' && ctx.input.target.type === this.type;
  }

  async apply(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'rename') {
      throw new Error('LeafResourceRenameHandler called with non-rename input');
    }
    const oldName = resourceNameToString(ctx.input.target);
    const newName = `${ctx.input.target.prefix}/${this.type}/${ctx.input.newIdentifier}`;

    const resource = ctx.project.resources.byType(oldName, this.type);
    if (!resource) {
      throw new Error(`${this.label} '${oldName}' not found`);
    }

    // Rewrite cascading references BEFORE renaming the resource on disk.
    // Order matters: cascade scanners look for the old name, and the resource
    // folder (with that name) must still exist when they run.
    await rewriteContentFileRefs(ctx.project, oldName, newName);
    await rewriteCardContentRefs(ctx.project, oldName, newName);

    // Rename the resource itself (renames its metadata file and, for folder
    // resources, the content folder).
    await resource.rename(resourceName(newName));
  }
}
