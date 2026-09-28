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

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

/**
 * The current user's active changeSet per project: while one is set, the
 * app reads and writes the project through it (see projectApiPaths). The
 * server keeps the truth; this mirrors it and is not persisted.
 */
export interface ChangeSetState {
  activeByPrefix: Record<string, string | null>;
}

const initialState: ChangeSetState = {
  activeByPrefix: {},
};

export const changeSetSlice = createSlice({
  name: 'changeSet',
  initialState,
  reducers: {
    setActiveChangeSet(
      state,
      action: PayloadAction<{ prefix: string; id: string | null }>,
    ) {
      state.activeByPrefix[action.payload.prefix] = action.payload.id;
    },
  },
});

export const { setActiveChangeSet } = changeSetSlice.actions;

/** The active changeSet id in a project, or null in the project itself. */
export const selectActiveChangeSet =
  (prefix?: string) =>
  (state: { changeSet: ChangeSetState }): string | null =>
    (prefix && state.changeSet.activeByPrefix[prefix]) || null;

export default changeSetSlice.reducer;
