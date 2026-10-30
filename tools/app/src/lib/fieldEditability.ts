// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import i18n from 'i18next';
import type { CardView } from '@/lib/api/types';

export interface FieldEditability {
  disabled: boolean;
  /** Why the field is disabled, when there is something to tell the user. */
  reason?: string;
}

/** Whether a card field can be edited by the current user, and why not. */
export function fieldEditability({
  card,
  fieldKey,
  canEditRole,
  readOnly,
}: {
  card: Pick<CardView, 'fields' | 'deniedOperations'>;
  fieldKey: string;
  canEditRole: boolean;
  readOnly?: boolean;
}): FieldEditability {
  if (readOnly) return { disabled: true };
  if (!canEditRole) {
    return { disabled: true, reason: i18n.t('permissions.editorRequired') };
  }
  const field = card.fields?.find((f) => f.key === fieldKey);
  if (field?.isCalculated && !field.isOverridable) {
    return { disabled: true, reason: i18n.t('calculatedField') };
  }
  const denied = card.deniedOperations.editField.find(
    (f) => f.fieldName === fieldKey,
  );
  return denied
    ? { disabled: true, reason: denied.errorMessage }
    : { disabled: false };
}
