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

import type { Handler, MutationContext } from './handler.js';
import { DefaultNoCascadeHandler } from './handlers/default-no-cascade.js';
import { LinkTypeDeleteHandler } from './handlers/link-type-delete.js';
import { LinkTypeEditCardTypesHandler } from './handlers/link-type-edit-card-types.js';
import { LinkTypeRenameHandler } from './handlers/link-type-rename.js';
import { CardTypeRenameHandler } from './handlers/card-type-rename.js';
import { CardTypeDeleteHandler } from './handlers/card-type-delete.js';
import { CardTypeAddCustomFieldHandler } from './handlers/card-type-add-custom-field.js';
import { CardTypeRemoveCustomFieldHandler } from './handlers/card-type-remove-custom-field.js';
import { CardTypeWorkflowChangeHandler } from './handlers/card-type-workflow-change.js';
import { FieldTypeRenameHandler } from './handlers/field-type-rename.js';
import { FieldTypeDataTypeHandler } from './handlers/field-type-data-type.js';
import { FieldTypeEnumAddHandler } from './handlers/field-type-enum-add.js';
import { FieldTypeEnumRemoveHandler } from './handlers/field-type-enum-remove.js';
import { FieldTypeEnumRenameHandler } from './handlers/field-type-enum-rename.js';
import { FieldTypeDeleteHandler } from './handlers/field-type-delete.js';
import { WorkflowRenameHandler } from './handlers/workflow-rename.js';
import { WorkflowAddStateHandler } from './handlers/workflow-add-state.js';
import { WorkflowRemoveStateHandler } from './handlers/workflow-remove-state.js';
import { WorkflowRenameStateHandler } from './handlers/workflow-rename-state.js';
import { WorkflowTransitionHandler } from './handlers/workflow-transition.js';
import { WorkflowDeleteHandler } from './handlers/workflow-delete.js';
import { TemplateRenameHandler } from './handlers/template.js';
import { CalculationRenameHandler } from './handlers/calculation.js';
import { ReportRenameHandler } from './handlers/report.js';
import { GraphModelRenameHandler } from './handlers/graph-model.js';
import { GraphViewRenameHandler } from './handlers/graph-view.js';

const HANDLERS: Handler[] = [
  new LinkTypeRenameHandler(),
  new LinkTypeDeleteHandler(),
  new LinkTypeEditCardTypesHandler(),
  new CardTypeRenameHandler(),
  new CardTypeDeleteHandler(),
  // Cascades are operation-specific — keep one handler per edit operation;
  // don't merge these into a shared base.
  new CardTypeAddCustomFieldHandler(),
  new CardTypeRemoveCustomFieldHandler(),
  new CardTypeWorkflowChangeHandler(),
  // Cascades are operation-specific — keep one handler per edit operation;
  // don't merge these into a shared base.
  new FieldTypeRenameHandler(),
  new FieldTypeDataTypeHandler(),
  new FieldTypeEnumAddHandler(),
  new FieldTypeEnumRemoveHandler(),
  new FieldTypeEnumRenameHandler(),
  new FieldTypeDeleteHandler(),
  // Cascades are operation-specific — keep one handler per operation; don't
  // merge these into a shared base.
  new WorkflowRenameHandler(),
  new WorkflowAddStateHandler(),
  new WorkflowRemoveStateHandler(),
  new WorkflowRenameStateHandler(),
  new WorkflowTransitionHandler(),
  new WorkflowDeleteHandler(),
  // The leaf-resource rename handlers below are near-identical thin routers on
  // purpose: each absorbs its own cascade from its resource class when the
  // legacy path is removed, so don't merge them into a shared base.
  new TemplateRenameHandler(),
  new CalculationRenameHandler(),
  new ReportRenameHandler(),
  new GraphModelRenameHandler(),
  new GraphViewRenameHandler(),
  new DefaultNoCascadeHandler(),
];

export function dispatch(ctx: MutationContext): Handler {
  for (const handler of HANDLERS) {
    if (handler.matches(ctx)) return handler;
  }
  throw new Error(
    `No mutation handler for input: ${JSON.stringify(ctx.input)}`,
  );
}

/** Test-only escape hatch for registering a handler ahead of the default. */
export function _registerHandlerForTest(handler: Handler): () => void {
  HANDLERS.unshift(handler);
  return () => {
    const idx = HANDLERS.indexOf(handler);
    if (idx >= 0) HANDLERS.splice(idx, 1);
  };
}
