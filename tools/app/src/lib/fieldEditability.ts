// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import i18n from 'i18next';
import type { CardView } from '@/lib/api/types';

/** Why a field cannot be edited here. */
type FieldDisabledCause = 'readOnly' | 'role' | 'calculated' | 'denied';

export interface FieldEditability {
  disabled: boolean;
  /** Set whenever `disabled`. */
  cause?: FieldDisabledCause;
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
  if (readOnly) return { disabled: true, cause: 'readOnly' };
  if (!canEditRole) {
    return {
      disabled: true,
      cause: 'role',
      reason: i18n.t('permissions.editorRequired'),
    };
  }
  const field = card.fields?.find((f) => f.key === fieldKey);
  if (field?.isCalculated && !field.isOverridable) {
    return {
      disabled: true,
      cause: 'calculated',
      reason: i18n.t('calculatedField'),
    };
  }
  const denied = card.deniedOperations.editField.find(
    (f) => f.fieldName === fieldKey,
  );
  return denied
    ? { disabled: true, cause: 'denied', reason: denied.errorMessage }
    : { disabled: false };
}
