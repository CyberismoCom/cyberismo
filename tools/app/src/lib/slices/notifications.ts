// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { PayloadAction } from '@reduxjs/toolkit';
import { createSlice, nanoid } from '@reduxjs/toolkit';

export interface Notification {
  id: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
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
