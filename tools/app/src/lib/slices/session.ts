// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { createSlice } from '@reduxjs/toolkit';

export interface SessionState {
  sessionExpired: boolean;
}

const initialState: SessionState = {
  sessionExpired: false,
};

export const sessionSlice = createSlice({
  name: 'session',
  initialState,
  reducers: {
    setSessionExpired(state) {
      state.sessionExpired = true;
    },
  },
});

export const { setSessionExpired } = sessionSlice.actions;

export default sessionSlice.reducer;
