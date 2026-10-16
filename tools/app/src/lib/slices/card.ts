// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { PayloadAction } from '@reduxjs/toolkit';
import { createSlice } from '@reduxjs/toolkit';

export interface CardState {
  recentlyCreated: string[];
}

export const initialState: CardState = {
  recentlyCreated: [],
};

export const cardSlice = createSlice({
  name: 'card',
  initialState,
  reducers: {
    setRecentlyCreated: (state, action: PayloadAction<string[]>) => {
      state.recentlyCreated = action.payload;
    },
  },
});

export const { setRecentlyCreated } = cardSlice.actions;

export default cardSlice.reducer;
