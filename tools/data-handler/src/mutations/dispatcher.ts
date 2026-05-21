// tools/data-handler/src/mutations/dispatcher.ts

import type { Handler, MutationContext } from './handler.js';
import { DefaultNoCascadeHandler } from './handlers/default-no-cascade.js';
import { FieldTypeDataTypeHandler } from './handlers/field-type-data-type.js';
import { FieldTypeEnumAddHandler } from './handlers/field-type-enum-add.js';
import { FieldTypeEnumRemoveHandler } from './handlers/field-type-enum-remove.js';
import { FieldTypeDeleteHandler } from './handlers/field-type-delete.js';
import { FieldTypeEnumRenameHandler } from './handlers/field-type-enum-rename.js';
import { FieldTypeRenameHandler } from './handlers/field-type-rename.js';
import { LinkTypeRenameHandler } from './handlers/link-type-rename.js';
import { CardTypeAddCustomFieldHandler } from './handlers/card-type-add-custom-field.js';
import { CardTypeRemoveCustomFieldHandler } from './handlers/card-type-remove-custom-field.js';
import { CardTypeRenameHandler } from './handlers/card-type-rename.js';
import { CardTypeWorkflowChangeHandler } from './handlers/card-type-workflow-change.js';

const HANDLERS: Handler[] = [
  new LinkTypeRenameHandler(),
  new CardTypeWorkflowChangeHandler(),
  new CardTypeAddCustomFieldHandler(),
  new CardTypeRemoveCustomFieldHandler(),
  new CardTypeRenameHandler(),
  new FieldTypeRenameHandler(),
  new FieldTypeDataTypeHandler(),
  new FieldTypeEnumAddHandler(),
  new FieldTypeEnumRemoveHandler(),
  new FieldTypeEnumRenameHandler(),
  new FieldTypeDeleteHandler(),
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
