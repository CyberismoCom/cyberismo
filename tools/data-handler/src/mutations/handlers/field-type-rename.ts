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
import { resourceNameToString } from '../../utils/resource-utils.js';
import { ResourcesFrom } from '../../containers/project/resources-from.js';
import {
  rewriteCardContentRefs,
  rewriteContentFileRefs,
} from '../cascades/rewrite-refs.js';

/**
 * Renaming a field type is a breaking change: card-content references,
 * calculations, report handlebars, the customFields[].name entries on every
 * referencing local card type and the metadata keys of every local card
 * holding a value under the old name are rewritten. The operation is marked
 * breaking so the engine records a log entry.
 */
export class FieldTypeRenameHandler implements Handler {
  readonly isBreaking = true;

  matches(ctx: MutationContext): boolean {
    return (
      ctx.input.kind === 'rename' && ctx.input.target.type === 'fieldTypes'
    );
  }

  async apply(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'rename') {
      throw new Error('FieldTypeRenameHandler called with non-rename input');
    }
    const oldName = resourceNameToString(ctx.input.target);

    const resource = ctx.project.resources.byType(oldName, 'fieldTypes');
    if (!resource) {
      throw new Error(`Field type '${oldName}' not found`);
    }

    // Authoring guard: renaming a field type that a local card type still
    // references is refused. Replay never hits this — applyCascade is called
    // directly there and rewrites the references instead.
    const referencing = ctx.project.resources
      .cardTypes(ResourcesFrom.localOnly)
      .find((cardType) =>
        cardType.data?.customFields?.some((field) => field.name === oldName),
      );
    if (referencing) {
      throw new Error(
        `Cannot rename field type '${oldName}': it is referenced by card type '${referencing.data!.name}'`,
      );
    }

    // Rename the resource before the cascade: cascade legs regenerate clingo
    // facts, which resolve custom-field metadata keys against the project, so
    // the new name must already exist.
    await resource.rename(ctx.input.newIdentifier);

    await this.applyCascade(ctx);
  }

  async applyCascade(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'rename') {
      throw new Error('FieldTypeRenameHandler called with non-rename input');
    }
    const oldName = resourceNameToString(ctx.input.target);
    const newName = `${ctx.input.target.prefix}/fieldTypes/${ctx.input.newIdentifier}`;

    // Strict sequencing, not Promise.all: card-type references and card
    // metadata keys must already hold the NEW name when
    // rewriteCardContentRefs regenerates clingo facts — fact generation
    // resolves every non-null custom metadata key as a field type, and only
    // the new name exists (in the module tree during replay, on the renamed
    // resource during authoring).
    await this.updateCardTypes(ctx, oldName, newName);
    await this.renameCardMetadataKeys(ctx, oldName, newName);
    await rewriteContentFileRefs(ctx.project, oldName, newName);
    await rewriteCardContentRefs(ctx.project, oldName, newName);
  }

  // Rewrite every LOCAL card type's references to the renamed field type
  // through the non-validating, shape-preserving resource write path.
  // Module-owned card types are immutable from the consumer side; their
  // references are the owning module's responsibility.
  private async updateCardTypes(
    ctx: MutationContext,
    oldName: string,
    newName: string,
  ): Promise<void> {
    const cardTypes = ctx.project.resources.cardTypes(ResourcesFrom.localOnly);
    for (const cardType of cardTypes) {
      await cardType.renameFieldTypeReferences(oldName, newName);
    }
  }

  // Rename the metadata key on every local card (project cards and local
  // template cards; module cards excluded) holding a value under the old
  // field name, preserving the value.
  private async renameCardMetadataKeys(
    ctx: MutationContext,
    oldName: string,
    newName: string,
  ): Promise<void> {
    const cards = [
      ...ctx.project.cards(ctx.project.paths.cardRootFolder),
      ...ctx.project.resources
        .templates(ResourcesFrom.localOnly)
        .flatMap((template) => template.templateObject().cards()),
    ];
    for (const card of cards) {
      const metadata = card.metadata;
      if (!metadata || !(oldName in metadata)) continue;
      metadata[newName] = metadata[oldName];
      delete metadata[oldName];
      await ctx.project.updateCardMetadata(card, metadata);
    }
  }
}
