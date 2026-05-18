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

export interface ProjectState {
  projectPrefix: string | undefined;
  recentPrefixes: string[];
}

export const initialState: ProjectState = {
  projectPrefix: undefined,
  recentPrefixes: [],
};

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
  },
});

export const { setProjectPrefix, clearProjectPrefix, addRecentProject } =
  projectSlice.actions;
export const selectProjectPrefix = (state: RootState) =>
  state.project.projectPrefix;
export const selectRecentPrefixes = (state: RootState) =>
  state.project.recentPrefixes;
export default projectSlice.reducer;
