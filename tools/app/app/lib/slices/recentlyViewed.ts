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
