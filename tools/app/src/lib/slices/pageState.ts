// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { PayloadAction } from '@reduxjs/toolkit';
import { createSlice } from '@reduxjs/toolkit';

export interface ViewState {
  title: string | null;
  cardKey: string | null;
}

export interface PageState {
  isEdited: boolean;
  title: string | null; // title of the section being viewed as an asciidoc id
  cardKey: string | null; // cardKey of the section being edited. Mainly used to make sure we don't scroll on other cards
  linkedCardsExpanded: boolean;
}

export const initialState: PageState = {
  isEdited: false,
  title: null,
  cardKey: null,
  linkedCardsExpanded: false,
};

export const pageSlice = createSlice({
  name: 'page',
  initialState,
  reducers: {
    isEdited: (state, action: PayloadAction<boolean>) => {
      state.isEdited = action.payload;
    },
    viewChanged: (state, action: PayloadAction<ViewState>) => {
      state.cardKey = action.payload.cardKey;
      state.title = action.payload.title;
    },
    setLinkedCardsExpanded: (state, action: PayloadAction<boolean>) => {
      state.linkedCardsExpanded = action.payload;
    },
  },
});

export const { isEdited, viewChanged, setLinkedCardsExpanded } =
  pageSlice.actions;

export default pageSlice.reducer;
