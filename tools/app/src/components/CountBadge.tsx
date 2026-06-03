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

import type { ReactNode } from 'react';
import { Box, Typography } from '@mui/joy';

// Shared 24×24 soft-primary circular pill, used for both the count badge and
// the icon leading slot so they line up and share a visual treatment when used
// side-by-side as the leading content of an AccordionSummary (or similar
// header row). MUI icons inherit `currentColor` for their SVG fill, so the
// `color` token below also paints any icon child.
const SLOT_SX = {
  width: 24,
  height: 24,
  borderRadius: '50%',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  boxSizing: 'border-box',
  bgcolor: 'primary.softBg',
  color: 'primary.softColor',
} as const;

/**
 * A 24×24 circular soft-primary badge displaying a count. Renders nothing when
 * `count` is 0 so callers don't need to guard the call.
 */
export const CountBadge = ({ count }: { count: number }) => {
  if (count <= 0) return null;
  return (
    <Typography
      level="body-xs"
      sx={{
        ...SLOT_SX,
        lineHeight: 1,
        margin: 0,
        padding: 0,
      }}
    >
      {count}
    </Typography>
  );
};

/**
 * A 24×24 circular soft-primary pill for non-badge leading content (e.g. an
 * icon) so it occupies the same footprint and matches the visual treatment of
 * `CountBadge`.
 */
export const LeadingSlot = ({ children }: { children: ReactNode }) => (
  <Box sx={SLOT_SX}>{children}</Box>
);
