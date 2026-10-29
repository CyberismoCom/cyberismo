// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { Snackbar, IconButton } from '@mui/joy';
import CloseRounded from '@mui/icons-material/CloseRounded';
import { useAppDispatch, useAppSelector } from '@/lib/hooks';
import {
  closeNotification,
  removeNotification,
} from '../lib/slices/notifications.js';

const colorMap = {
  error: 'danger',
  info: 'primary',
  success: 'success',
  warning: 'warning',
} as const;

const durationMap = {
  error: 10000,
  info: 4000,
  success: 4000,
  warning: 10000,
} as const;

export function Notifications() {
  const dispatch = useAppDispatch();
  const notifications = useAppSelector(
    (state) => state.notifications.notifications,
  );

  return (
    <>
      {notifications.map((notification, index) => {
        const color = colorMap[notification.type];
        const autoHideDuration = notification.disableAutoClose
          ? null
          : durationMap[notification.type];

        return (
          <Snackbar
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            key={notification.id}
            open={!notification.closed}
            sx={{ marginBottom: index * 9 }}
            autoHideDuration={autoHideDuration}
            color={color}
            variant="solid"
            data-cy="notification"
            onClose={(_, reason) => {
              if (
                reason === 'clickaway' &&
                notification.createdAt + 2000 >= Date.now()
              ) {
                return;
              }
              dispatch(closeNotification(notification.id));
            }}
            onUnmount={() => {
              dispatch(removeNotification(notification.id));
            }}
            endDecorator={
              <IconButton
                variant="plain"
                size="sm"
                color="neutral"
                data-cy="notificationClose"
                onClick={() => {
                  dispatch(closeNotification(notification.id));
                }}
              >
                <CloseRounded />
              </IconButton>
            }
          >
            {notification.message}
          </Snackbar>
        );
      })}
    </>
  );
}
