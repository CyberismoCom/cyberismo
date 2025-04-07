/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { createSlice } from '@reduxjs/toolkit';
import { cardDeleted, cardViewed } from '../actions';
import { MAX_RECENTS_STORED } from '../constants';
import { CardView } from '../definitions';

export interface RecentlyViewedState {
  pages: CardView[];
}

export const initialState: RecentlyViewedState = {
  pages: [],
};

// Recursively delete a card and all its children
// Could be optimized
function deleteCard(state: RecentlyViewedState, key: string) {
  const card = state.pages.find((page) => page.key === key);
  if (card) {
    for (const child of card.children) {
      deleteCard(state, child);
    }
    state.pages = state.pages.filter((page) => page.key !== key);
  }
}

export const recentlyViewedSlice = createSlice({
  name: 'recentlyViewed',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder.addCase(cardViewed, (state, action) => {
      state.pages = state.pages.filter(
        (page) => page.key !== action.payload.key,
      );
      if (state.pages.unshift(action.payload) > MAX_RECENTS_STORED) {
        state.pages.pop();
      }
    });
    builder.addCase(cardDeleted, (state, action) => {
      deleteCard(state, action.payload);
    });
  },
});

export default recentlyViewedSlice.reducer;
