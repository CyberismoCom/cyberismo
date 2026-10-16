// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { CleanResult } from '@cyberismo/model';

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
