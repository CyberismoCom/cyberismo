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
  // The project the findings were scanned from. Surviving navigation also means
  // surviving a switch to another project, so the offer carries the project it
  // applies to instead of leaving the confirm to resolve one from the URL.
  projectPrefix: string | null;
}

export const initialState: CleanPromptState = {
  findings: null,
  projectPrefix: null,
};

export const cleanPromptSlice = createSlice({
  name: 'cleanPrompt',
  initialState,
  reducers: {
    showCleanPrompt(
      state,
      action: PayloadAction<{ findings: CleanResult; projectPrefix: string }>,
    ) {
      state.findings = action.payload.findings;
      state.projectPrefix = action.payload.projectPrefix;
    },
    dismissCleanPrompt(state) {
      state.findings = null;
      state.projectPrefix = null;
    },
  },
});

export const { showCleanPrompt, dismissCleanPrompt } = cleanPromptSlice.actions;

export default cleanPromptSlice.reducer;
