import { createSlice } from '@reduxjs/toolkit'
import { successEvent, errorEvent } from '../actions'

export interface Notification {
  id: number
  message: string
  type: 'success' | 'error'
  closed: boolean
}

export type NotificationMessage = Omit<Notification, 'id'>

export interface NotificationsState {
  notifications: Notification[]
  prevId: number
}

export const initialState: NotificationsState = {
  notifications: [],
  prevId: 0,
}

export const notificationsSlice = createSlice({
  name: 'notifications',
  initialState,
  reducers: {
    removeNotification(state, action) {
      state.notifications = state.notifications.filter(
        (notification) => notification.id !== action.payload
      )
    },
    closeNotification(state, action) {
      const notification = state.notifications.find(
        (notification) => notification.id === action.payload
      )
      if (notification) {
        notification.closed = true
      }
    },
  },
  extraReducers: (builder) => {
    builder.addCase(successEvent, (state, action) => {
      state.notifications.push({
        message: action.payload.message,
        type: 'success',
        id: ++state.prevId,
        closed: false,
      })
    })
    builder.addCase(errorEvent, (state, action) => {
      state.notifications.push({
        message: action.payload.message,
        type: 'error',
        id: ++state.prevId,
        closed: false,
      })
    })
  },
})
export const { closeNotification, removeNotification } =
  notificationsSlice.actions

export default notificationsSlice.reducer
