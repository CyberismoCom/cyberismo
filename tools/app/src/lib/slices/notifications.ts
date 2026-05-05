/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import type { PayloadAction } from '@reduxjs/toolkit';
import { createSlice, nanoid } from '@reduxjs/toolkit';

export interface Notification {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
  closed: boolean;
  createdAt: number;
  disableAutoClose: boolean;
}

export type NotificationMessage = Omit<
  Notification,
  'id' | 'closed' | 'createdAt' | 'disableAutoClose'
> & { disableAutoClose?: boolean };

export interface NotificationsState {
  notifications: Notification[];
}

export const initialState: NotificationsState = {
  notifications: [],
};

export const notificationsSlice = createSlice({
  name: 'notifications',
  initialState,
  reducers: {
    removeNotification(state, action: PayloadAction<string>) {
      state.notifications = state.notifications.filter(
        (notification) => notification.id !== action.payload,
      );
    },
    closeNotification(state, action: PayloadAction<string>) {
      const notification = state.notifications.find(
        (notification) => notification.id === action.payload,
      );
      if (notification) {
        notification.closed = true;
      }
    },
    addNotification: {
      reducer(state, action: PayloadAction<Notification>) {
        state.notifications.push(action.payload);
      },
      prepare(notification: NotificationMessage) {
        return {
          payload: {
            ...notification,
            id: nanoid(),
            closed: false,
            createdAt: Date.now(),
            disableAutoClose: notification.disableAutoClose ?? false,
          },
        };
      },
    },
  },
});
export const { closeNotification, removeNotification, addNotification } =
  notificationsSlice.actions;

export default notificationsSlice.reducer;
