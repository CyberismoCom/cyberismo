/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

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
