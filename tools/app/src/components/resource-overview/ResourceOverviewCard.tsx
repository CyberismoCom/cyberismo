/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2025
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { Card, CardContent, Divider, Stack, Typography } from '@mui/joy';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import { Link as RouterLink } from 'react-router';

export function ResourceOverviewCard({
  title,
  description,
  to,
}: {
  title: string;
  description?: string;
  to: string;
}) {
  return (
    <Card
      variant="plain"
      component={RouterLink}
      to={to}
      sx={{
        textDecoration: 'none',
        backgroundColor: 'inherit',
        overflow: 'hidden',
      }}
    >
      <CardContent>
        <Stack direction="row" spacing={1}>
          <Typography level="title-lg" noWrap>
            {title}
          </Typography>
          <ArrowForwardRounded color="primary" />
        </Stack>
        <Typography
          level="body-sm"
          sx={{
            color: 'neutral.700',
            mt: 0.5,
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: 3,
            lineClamp: 3,
            minHeight: `calc(var(--joy-lineHeight-md) * 3em)`,
          }}
        >
          {description || '-'}
        </Typography>
        <Divider
          sx={{
            mt: 2,
          }}
        />
      </CardContent>
    </Card>
  );
}
