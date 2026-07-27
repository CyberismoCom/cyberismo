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

import type { ReactNode } from 'react';
import { Box, Card, CardOverflow, Grid, Stack, Typography } from '@mui/joy';

export type OptionCardSize = 'sm' | 'md';

const SIZES: Record<OptionCardSize, { width: number; height: number }> = {
  sm: { width: 170, height: 120 },
  md: { width: 200, height: 200 },
};

const RADIUS = 16;

export interface OptionCardProps {
  title: string;
  // First line of the tinted band. Further lines go in children.
  caption?: string;
  // Top right corner: a radio, a checkbox, an icon button or a status icon.
  action?: ReactNode;
  children?: ReactNode;
  size?: OptionCardSize;
  // Marks the card as the one in effect, distinct from a pending selection.
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
  className?: string;
  'data-cy'?: string;
}

/**
 * One tile in a grid of things to pick from: a fixed box with a title, a
 * corner control and a tinted caption band.
 *
 * Callers render these themselves rather than describing them to a list
 * component, so each tile carries its own handlers and its own test hooks.
 */
export function OptionCard({
  title,
  caption,
  action,
  children,
  size = 'md',
  selected,
  disabled,
  onClick,
  onDoubleClick,
  className,
  'data-cy': dataCy,
}: OptionCardProps) {
  const { width, height } = SIZES[size];

  return (
    <Card
      className={className}
      variant="outlined"
      data-cy={dataCy}
      sx={{
        height,
        width,
        boxShadow: '0px 2px 2px 0px rgba(0, 0, 0, 0.5)',
        cursor: onClick ? (disabled ? 'not-allowed' : 'pointer') : 'default',
        padding: 0,
        overflow: 'hidden',
        gap: 0,
        borderRadius: RADIUS,
        ...(selected && { borderColor: 'primary.500', borderWidth: 2 }),
      }}
      onClick={() => {
        if (disabled) {
          return;
        }
        onClick?.();
      }}
      onDoubleClick={disabled ? undefined : onDoubleClick}
    >
      <Stack
        direction="row"
        padding={0}
        height="50%"
        sx={{
          justifyContent: 'space-between',
        }}
      >
        <Typography
          level="title-sm"
          paddingLeft={2}
          fontWeight="bold"
          textOverflow="clip"
          marginTop="auto"
          marginBottom={1}
        >
          {title}
        </Typography>
        <Box padding={1} height="100%">
          {action}
        </Box>
      </Stack>
      <CardOverflow
        sx={{
          height: '50%',
          borderBottomLeftRadius: RADIUS,
          borderBottomRightRadius: RADIUS,
        }}
      >
        <Box
          bgcolor="neutral.softBg"
          height="100%"
          paddingLeft={2}
          paddingTop={1}
          paddingRight={1}
          sx={{
            overflow: 'hidden',
            borderBottomLeftRadius: RADIUS,
            borderBottomRightRadius: RADIUS,
          }}
        >
          {caption && (
            <Typography
              level="body-xs"
              fontWeight="bold"
              sx={{ wordBreak: 'break-word' }}
            >
              {caption}
            </Typography>
          )}
          {children}
        </Box>
      </CardOverflow>
    </Card>
  );
}

/**
 * Lays out option cards as a wrapping grid.
 */
export function OptionCardGrid({ children }: { children: ReactNode }) {
  return (
    <Grid
      container
      spacing={2}
      columnGap={2}
      rowGap={2}
      justifyContent="flex-start"
      marginTop={2}
      marginBottom={4}
      marginLeft={0}
      paddingRight={1}
      paddingBottom={1}
    >
      {children}
    </Grid>
  );
}

export default OptionCard;
