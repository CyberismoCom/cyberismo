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

import type { CardResponse } from '@/lib/api/types';
import type { MetadataValue } from '@/lib/definitions';
import { getDefaultValue } from '@/lib/utils';

// Editor-specific working-draft model. Generic helpers (coerce, equality, the
// field-row id) live in @/lib/utils and are shared with the metadata view.

/** Draft keys for the title and labels (custom fields use their own key). */
export const TITLE_KEY = '__title__';
export const LABELS_KEY = '__labels__';

/** Build the working draft (title, labels and every custom field) from a card. */
export function buildDraft(card: CardResponse): Record<string, MetadataValue> {
  return {
    [TITLE_KEY]: card.title ?? '',
    [LABELS_KEY]: card.labels ?? [],
    ...Object.fromEntries(
      (card.fields ?? []).map((f) => [f.key, getDefaultValue(f.value)]),
    ),
  };
}
