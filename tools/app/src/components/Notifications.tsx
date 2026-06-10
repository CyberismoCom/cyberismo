/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2025
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

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
} as const;

const durationMap = {
  error: 10000,
  info: 4000,
  success: 4000,
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
