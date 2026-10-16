// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { Box, Card, Typography } from '@mui/joy';
import type { MacroContext } from '.';

export type CreateCardsProps = {
  title?: string;
  value: number;
  unit?: string;
  legend?: string;
} & MacroContext;

export default function ScoreCard({
  title,
  value,
  unit,
  legend,
}: CreateCardsProps) {
  return (
    <Card
      variant="outlined"
      style={{
        borderRadius: '12px',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
        display: 'inline-block',
        padding: '20px',
        marginTop: '20px',
        marginRight: '20px',
      }}
    >
      <Typography style={{ fontSize: '16px' }}>{title}</Typography>
      <Box
        style={{
          display: 'flex',
          alignItems: 'baseline',
        }}
      >
        <Typography
          style={{
            fontSize: '48px',
            fontWeight: 'bold',
          }}
        >
          {value}
        </Typography>
        <Typography
          style={{
            fontSize: '24px',
            marginLeft: '4px',
          }}
        >
          {unit}
        </Typography>
      </Box>
      <Typography
        level="body-sm"
        style={{
          fontSize: '14px',
        }}
      >
        {legend}
      </Typography>
    </Card>
  );
}
