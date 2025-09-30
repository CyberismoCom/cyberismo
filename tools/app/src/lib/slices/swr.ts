/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

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
