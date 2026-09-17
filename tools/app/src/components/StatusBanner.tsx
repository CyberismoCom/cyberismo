/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

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
