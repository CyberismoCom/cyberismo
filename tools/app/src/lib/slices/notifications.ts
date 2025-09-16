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

export interface Notification {
  id: number;
  message: string;
  type: 'success' | 'error';
  closed: boolean;
  createdAt: number;
}

export type NotificationMessage = Omit<
  Notification,
  'id' | 'closed' | 'createdAt'
>;

export interface NotificationsState {
  notifications: Notification[];
  prevId: number;
}

export const initialState: NotificationsState = {
  notifications: [],
  prevId: 0,
};

export const notificationsSlice = createSlice({
  name: 'notifications',
  initialState,
  reducers: {
    removeNotification(state, action: PayloadAction<number>) {
      state.notifications = state.notifications.filter(
        (notification) => notification.id !== action.payload,
      );
    },
    closeNotification(state, action: PayloadAction<number>) {
      const notification = state.notifications.find(
        (notification) => notification.id === action.payload,
      );
      if (notification) {
        notification.closed = true;
      }
    },
    addNotification(state, action: PayloadAction<NotificationMessage>) {
      state.notifications.push({
        message: action.payload.message,
        type: action.payload.type,
        id: ++state.prevId,
        closed: false,
        createdAt: Date.now(),
      });
    },
  },
});
export const { closeNotification, removeNotification, addNotification } =
  notificationsSlice.actions;

export default notificationsSlice.reducer;
