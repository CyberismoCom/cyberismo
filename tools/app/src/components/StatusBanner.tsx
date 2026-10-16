// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { Button, Sheet, Stack, Typography } from '@mui/joy';

interface StatusBannerProps {
  color: 'danger' | 'warning';
  message: string;
  actionLabel: string;
  onAction: () => void;
}

/** A fixed, full-width banner pinned to the top of the viewport. */
export default function StatusBanner({
  color,
  message,
  actionLabel,
  onAction,
}: StatusBannerProps) {
  return (
    <Sheet
      color={color}
      variant="solid"
      sx={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 'snackbar',
        py: 1.5,
        px: 3,
        boxShadow: 'md',
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="center"
        gap={1.5}
      >
        <Typography level="body-sm" textColor="inherit">
          {message}
        </Typography>
        <Button
          size="sm"
          variant="solid"
          color="neutral"
          sx={{ bgcolor: 'background.body', color: `${color}.500` }}
          onClick={onAction}
        >
          {actionLabel}
        </Button>
      </Stack>
    </Sheet>
  );
}
