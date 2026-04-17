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

export interface ProjectState {
  projectPrefix: string | undefined;
}

export const initialState: ProjectState = {
  projectPrefix: undefined,
};

export const projectSlice = createSlice({
  name: 'project',
  initialState,
  reducers: {
    setProjectPrefix(state, action: PayloadAction<string>) {
      state.projectPrefix = action.payload;
    },
  },
});

export const { setProjectPrefix } = projectSlice.actions;
export const selectProjectPrefix = (state: RootState) =>
  state.project.projectPrefix;
export default projectSlice.reducer;
