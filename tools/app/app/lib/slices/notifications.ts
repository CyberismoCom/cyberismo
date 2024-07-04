import { PayloadAction, createSlice } from '@reduxjs/toolkit';

export interface Notification {
  id: number;
  message: string;
  type: 'success' | 'error';
  closed: boolean;
}

export type NotificationMessage = Omit<Notification, 'id' | 'closed'>;

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
      });
    },
  },
});
export const { closeNotification, removeNotification, addNotification } =
  notificationsSlice.actions;

export default notificationsSlice.reducer;
