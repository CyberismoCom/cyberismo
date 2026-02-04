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
