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

import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { CleanResult } from '@cyberismo/data-handler';

// The findings live in the store rather than in the component that asked for
// them: deleting a resource navigates away, which would unmount the asking
// component and take its modal with it.
export interface CleanPromptState {
  findings: CleanResult | null;
}

export const initialState: CleanPromptState = {
  findings: null,
};

export const cleanPromptSlice = createSlice({
  name: 'cleanPrompt',
  initialState,
  reducers: {
    showCleanPrompt(state, action: PayloadAction<CleanResult>) {
      state.findings = action.payload;
    },
    dismissCleanPrompt(state) {
      state.findings = null;
    },
  },
});

export const { showCleanPrompt, dismissCleanPrompt } = cleanPromptSlice.actions;

export default cleanPromptSlice.reducer;
