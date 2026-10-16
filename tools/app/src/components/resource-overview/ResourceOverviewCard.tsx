// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

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
