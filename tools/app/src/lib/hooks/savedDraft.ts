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

import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

// An editor holds a working draft while the fetched resource behind it stays
// canonical, so a save made elsewhere (another tab, another user, the CLI)
// moves the base the draft was seeded from. These hooks merge the new base in:
// what the user has not typed into follows it, and what holds unsaved edits
// keeps them and stays dirty, so the conflict is resolved deliberately rather
// than by silently discarding one side.

/** Deep equality over JSON-shaped values (the shape all resource data has). */
export const deepEqual = (a: unknown, b: unknown) =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Draft state seeded from `saved`, which follows `saved` when it changes unless
 * the draft holds an unsaved edit.
 */
export function useSavedDraft<T>(
  saved: T,
  equals: (a: T, b: T) => boolean = Object.is,
): [T, Dispatch<SetStateAction<T>>] {
  const [draft, setDraft] = useState(saved);
  const [prevSaved, setPrevSaved] = useState(saved);
  if (!Object.is(prevSaved, saved)) {
    setPrevSaved(saved);
    if (equals(draft, prevSaved)) setDraft(saved);
  }
  return [draft, setDraft];
}

/**
 * As {@link useSavedDraft}, but merged key by key: every key follows its new
 * saved value except the ones holding unsaved edits. Keys absent from `saved`
 * are left alone, so a field that disappears mid-edit does not lose its draft.
 */
export function useSavedRecordDraft<T>(
  saved: Record<string, T>,
  equals: (a: T, b: T) => boolean,
): [Record<string, T>, Dispatch<SetStateAction<Record<string, T>>>] {
  const [draft, setDraft] = useState(saved);
  const [prevSaved, setPrevSaved] = useState(saved);
  if (!Object.is(prevSaved, saved)) {
    setPrevSaved(saved);
    setDraft((d) => mergeSaved(d, prevSaved, saved, equals));
  }
  return [draft, setDraft];
}

/**
 * Per-key merge of a new saved record into a draft. Returns the same draft
 * when nothing moves, so React can skip the re-render.
 */
function mergeSaved<T>(
  draft: Record<string, T>,
  prevSaved: Record<string, T>,
  nextSaved: Record<string, T>,
  equals: (a: T, b: T) => boolean,
): Record<string, T> {
  const next = { ...draft };
  let changed = false;
  for (const [key, savedValue] of Object.entries(nextSaved)) {
    if (equals(savedValue, draft[key])) continue;
    if (!equals(draft[key], prevSaved[key])) continue;
    next[key] = savedValue;
    changed = true;
  }
  return changed ? next : draft;
}
