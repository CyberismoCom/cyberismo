// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { IconButton, Stack } from '@mui/joy';
import type { SxProps } from '@mui/joy/styles/types';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';

export interface ReorderButtonProps {
  direction: 'up' | 'down';
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  color?: 'neutral' | 'primary';
  sx?: SxProps;
}

export function ReorderButton({
  direction,
  onClick,
  disabled,
  title,
  color = 'neutral',
  sx,
}: ReorderButtonProps) {
  const Icon = direction === 'up' ? KeyboardArrowUpIcon : KeyboardArrowDownIcon;

  return (
    <IconButton
      size="sm"
      variant="plain"
      color={color}
      disabled={disabled}
      onClick={onClick}
      title={title}
      sx={sx}
    >
      <Icon fontSize="small" />
    </IconButton>
  );
}

export interface ReorderButtonContainerProps {
  children: React.ReactNode;
}

export function ReorderButtonContainer({
  children,
}: ReorderButtonContainerProps) {
  return (
    <Stack
      spacing={-0.5}
      sx={{
        '& .MuiIconButton-root': {
          minHeight: 20,
          minWidth: 20,
          p: 0,
        },
      }}
    >
      {children}
    </Stack>
  );
}
