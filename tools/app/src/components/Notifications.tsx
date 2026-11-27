// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { Fragment } from 'react';
import { Box, IconButton, Link, Snackbar } from '@mui/joy';
import CloseRounded from '@mui/icons-material/CloseRounded';
import { useAppDispatch, useAppSelector } from '@/lib/hooks';
import { isPlainLeftClick } from '@/lib/utils';
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

type NotificationsProps = {
  /** Opens an in-app link without reloading the page. */
  navigate: (href: string) => void;
};

export function Notifications({ navigate }: NotificationsProps) {
  const dispatch = useAppDispatch();
  const notifications = useAppSelector(
    (state) => state.notifications.notifications,
  );

  return (
    <>
      {notifications.map((notification, index) => {
        const color = colorMap[notification.type];
        // Links may take a while to reach, so the toast waits for its close
        // button: no timeout, no outside click, no Escape.
        const sticky = !!notification.links?.length;
        const autoHideDuration =
          notification.disableAutoClose || sticky
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
              if (sticky) return;
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
            {notification.links || notification.more ? (
              <Box>
                {notification.message}{' '}
                {notification.links?.map(({ label, href }, linkIndex) => (
                  <Fragment key={linkIndex}>
                    {linkIndex > 0 && ', '}
                    <Link
                      href={href}
                      color="neutral"
                      textColor="inherit"
                      underline="always"
                      onClick={(event) => {
                        // Modified clicks open the link the browser's way
                        if (!isPlainLeftClick(event)) return;
                        event.preventDefault();
                        navigate(href);
                      }}
                    >
                      {label}
                    </Link>
                  </Fragment>
                ))}
                {notification.more && ` ${notification.more}`}
              </Box>
            ) : (
              notification.message
            )}
          </Snackbar>
        );
      })}
    </>
  );
}
