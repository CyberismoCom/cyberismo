/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2025

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { createSlice, PayloadAction } from '@reduxjs/toolkit';

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
