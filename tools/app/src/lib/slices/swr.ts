// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { PayloadAction } from '@reduxjs/toolkit';
import { createSlice } from '@reduxjs/toolkit';
import type { AdditionalState } from '../api/types';

export interface SwrState {
  additionalProps: Record<string, AdditionalState>; // stores additional state for swr hooks
}

export const initialState: SwrState = {
  additionalProps: {},
};

export const swrSlice = createSlice({
  name: 'swr',
  initialState,
  reducers: {
    setIsUpdating(
      state,
      action: PayloadAction<{ key: string; isUpdating: boolean }>,
    ) {
      state.additionalProps[action.payload.key] = {
        isUpdating: action.payload.isUpdating,
      };
    },
  },
  selectors: {
    selectIsUpdating: (state, key: string | null): boolean => {
      if (!key) return false;
      return state.additionalProps[key]?.isUpdating || false;
    },
  },
});

export const { setIsUpdating } = swrSlice.actions;

export const { selectIsUpdating } = swrSlice.selectors;

export default swrSlice.reducer;
