// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { CardView } from '@/lib/api/types';
import type { MetadataValue } from '@/lib/definitions';
import { getDefaultValue } from '@/lib/utils';

// Editor-specific working-draft model. Generic helpers (coerce, equality, the
// field-row id) live in @/lib/utils and are shared with the metadata view.

/** Draft keys for the title and labels (custom fields use their own key). */
export const TITLE_KEY = '__title__';
export const LABELS_KEY = '__labels__';

/** Build the working draft (title, labels and every custom field) from a card. */
export function buildDraft(card: CardView): Record<string, MetadataValue> {
  return {
    [TITLE_KEY]: card.title ?? '',
    [LABELS_KEY]: card.labels ?? [],
    ...Object.fromEntries(
      (card.fields ?? []).map((f) => [f.key, getDefaultValue(f.value)]),
    ),
  };
}
