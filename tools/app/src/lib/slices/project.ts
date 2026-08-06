/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from '../store';

const MAX_RECENT_PROJECTS = 5;

// Only these top-level sections are ever remembered as a project's "last
// visited page". This keeps a stale, manually-typed, or otherwise
// unmatched URL shape from ever being persisted and later replayed as a
// redirect target (see INTDEV-1340's stale-path risk).
const KNOWN_SECTION_PATH = /^\/(cards|configuration)(\/.*)?$/;

export interface ProjectState {
  projectPrefix: string | undefined;
  recentPrefixes: string[];
  lastPathByPrefix: Record<string, string>;
}

export const initialState: ProjectState = {
  projectPrefix: undefined,
  recentPrefixes: [],
  lastPathByPrefix: {},
};

/**
 * Derives the project-relative sub-path (e.g. "/cards/DEC-5") to remember
 * for `prefix` from a full router pathname
 * (e.g. "/projects/decision/cards/DEC-5"). Returns null when the pathname
 * isn't under this project, or doesn't look like a known top-level section.
 */
export function deriveLastPath(
  pathname: string,
  prefix: string,
): string | null {
  const prefixRoot = `/projects/${prefix}`;
  if (!pathname.startsWith(prefixRoot)) return null;
  const subPath = pathname.slice(prefixRoot.length) || '/cards';
  return KNOWN_SECTION_PATH.test(subPath) ? subPath : null;
}

/** Builds the URL to enter `prefix` at, using its remembered path if any. */
export function projectEntryPath(
  prefix: string,
  lastPathByPrefix: Record<string, string> | undefined,
): string {
  return `/projects/${prefix}${lastPathByPrefix?.[prefix] ?? '/cards'}`;
}

export const projectSlice = createSlice({
  name: 'project',
  initialState,
  reducers: {
    setProjectPrefix(state, action: PayloadAction<string>) {
      state.projectPrefix = action.payload;
    },
    clearProjectPrefix(state) {
      state.projectPrefix = undefined;
    },
    addRecentProject(state, action: PayloadAction<string>) {
      const prefix = action.payload;
      const current = state.recentPrefixes ?? [];
      state.recentPrefixes = [
        prefix,
        ...current.filter((p) => p !== prefix),
      ].slice(0, MAX_RECENT_PROJECTS);
    },
    setLastPathForPrefix(
      state,
      action: PayloadAction<{ prefix: string; path: string }>,
    ) {
      // `??=` because a user upgrading from a build without this key rehydrates
      // a `project` slice that has no `lastPathByPrefix` at all (redux-persist
      // autoMergeLevel1 replaces the slice wholesale, it does not deep-merge).
      (state.lastPathByPrefix ??= {})[action.payload.prefix] =
        action.payload.path;
    },
  },
});

export const {
  setProjectPrefix,
  clearProjectPrefix,
  addRecentProject,
  setLastPathForPrefix,
} = projectSlice.actions;
export const selectProjectPrefix = (state: RootState) =>
  state.project.projectPrefix;
export const selectRecentPrefixes = (state: RootState) =>
  state.project.recentPrefixes;
/** Stable reference, so a rehydrated state without the key can't churn selectors. */
const NO_LAST_PATHS: Record<string, string> = {};
export const selectLastPathByPrefix = (state: RootState) =>
  state.project.lastPathByPrefix ?? NO_LAST_PATHS;
export const selectLastPathForPrefix =
  (prefix: string | undefined) => (state: RootState) =>
    (prefix && state.project.lastPathByPrefix?.[prefix]) || '/cards';
export default projectSlice.reducer;
