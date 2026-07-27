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
import { Box, Card, CardOverflow, Stack, Typography } from '@mui/joy';

export type OptionCardSize = 'sm' | 'md';

const SIZES: Record<OptionCardSize, { width: number; height: number }> = {
  sm: { width: 170, height: 120 },
  md: { width: 200, height: 200 },
};

const RADIUS = 16;

export interface OptionCardProps {
  title: string;
  description: string;
  // Rendered in the top right corner: a radio, a checkbox or an action button.
  action: ReactNode;
  size?: OptionCardSize;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
  'data-cy'?: string;
}

/**
 * A fixed-size card with a title, a corner action and a tinted footer band.
 * Used wherever the app lists selectable things: templates, project creation
 * methods and modules available from a hub.
 */
export function OptionCard({
  title,
  description,
  action,
  size = 'md',
  disabled,
  onClick,
  className = 'templateCard',
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
        gap: 0,
        borderRadius: RADIUS,
      }}
      onClick={() => {
        if (disabled) {
          return;
        }
        onClick?.();
      }}
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
          sx={{
            borderBottomLeftRadius: RADIUS,
            borderBottomRightRadius: RADIUS,
          }}
        >
          <Typography
            level="body-xs"
            fontWeight="bold"
            paddingLeft={2}
            height="100%"
            paddingTop={1}
            sx={{
              wordBreak: 'break-word',
            }}
          >
            {description}
          </Typography>
        </Box>
      </CardOverflow>
    </Card>
  );
}

export default OptionCard;
