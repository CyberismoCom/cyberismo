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

/**
 * Renaming a template is a breaking change: createCards references in card
 * content, the template's handlebar files and calculations to the old name are
 * rewritten. The whole cascade still lives in TemplateResource.rename →
 * onNameChange (updateHandleBars + updateCalculations +
 * updateCardContentReferences), so this handler is a thin router: it delegates
 * to resource.rename() and only marks the operation breaking so the engine
 * records a log entry.
 *
 * Note: the template-card cache flush (cardsCache.deleteCardsFromTemplate)
 * lives only in the legacy TemplateResource.delete path — the rename path does
 * not touch the cards cache, so this router matches the legacy rename exactly.
 */
export class TemplateRenameHandler implements Handler {
  readonly isBreaking = true;

  matches(ctx: MutationContext): boolean {
    return ctx.input.kind === 'rename' && ctx.input.target.type === 'templates';
  }

  async apply(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'rename') {
      throw new Error('TemplateRenameHandler called with non-rename input');
    }
    const oldName = resourceNameToString(ctx.input.target);
    const newName = `${ctx.input.target.prefix}/templates/${ctx.input.newIdentifier}`;

    const resource = ctx.project.resources.byType(oldName, 'templates');
    if (!resource) {
      throw new Error(`Template '${oldName}' not found`);
    }
    await resource.rename(resourceName(newName));
  }
}
