// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { forwardRef } from 'react';
import { Sheet } from '@mui/joy';
import type { SxProps } from '@mui/joy/styles/types';

export interface ListRowProps {
  children: React.ReactNode;
  sx?: SxProps;
}

export const ListRow = forwardRef<HTMLDivElement, ListRowProps>(
  ({ children, sx }, ref) => (
    <Sheet
      ref={ref}
      variant="outlined"
      sx={{
        p: 1.5,
        py: 1,
        border: '0',
        borderRadius: 16,
        backgroundColor: 'neutral.softBg',
        width: '100%',
        ...sx,
      }}
    >
      {children}
    </Sheet>
  ),
);
