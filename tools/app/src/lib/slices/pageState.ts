/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface ViewState {
  title: string | null;
  cardKey: string | null;
}

export interface PageState {
  isEdited: boolean;
  title: string | null; // title of the section being viewed as an asciidoc id
  cardKey: string | null; // cardKey of the section being edited. Mainly used to make sure we don't scroll on other cards
}

export const initialState: PageState = {
  isEdited: false,
  title: null,
  cardKey: null,
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
  },
});

export const { isEdited, viewChanged } = pageSlice.actions;

export default pageSlice.reducer;
