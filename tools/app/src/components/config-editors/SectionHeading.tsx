// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { ReactNode } from 'react';
import { Stack, Typography } from '@mui/joy';
import type { SxProps } from '@mui/joy/styles/types';

/**
 * The heading of a section in a configuration form, with optional actions
 * beside it. Inside a form stack (spacing 3) it has 32px above and 16px below.
 */
export function SectionHeading({
  title,
  actions,
  component = 'h4',
  sx,
}: {
  title: string;
  actions?: ReactNode;
  component?: 'h2' | 'h3' | 'h4';
  sx?: SxProps;
}) {
  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={1}
      sx={[{ pt: 1, mb: 2 }, ...(Array.isArray(sx) ? sx : [sx])]}
    >
      <Typography level="h4" component={component}>
        {title}
      </Typography>
      {actions}
    </Stack>
  );
}

export default SectionHeading;
