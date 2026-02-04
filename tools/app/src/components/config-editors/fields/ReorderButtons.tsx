/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

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
