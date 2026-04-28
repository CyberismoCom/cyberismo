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

import { Divider, Link, Stack, Typography } from '@mui/joy';
import { Link as RouterLink } from 'react-router';
import type { CalculationLink } from '@cyberismo/data-handler/types/queries';

type LinkRowProps = {
  link: CalculationLink;
};

export function LinkRow({ link }: LinkRowProps) {
  return (
    <Stack
      direction="row"
      alignItems="center"
      sx={{
        borderLeft: '3px solid',
        borderColor: 'neutral.300',
        paddingX: 0.5,
        marginY: 0.5,
      }}
    >
      <Typography
        data-cy="cardLinkType"
        level="body-xs"
        width="40%"
        maxWidth={150}
        flexShrink={0}
        sx={{ whiteSpace: 'normal', position: 'relative' }}
      >
        {link.displayName}
      </Typography>
      <Stack direction="row" alignItems="center" gap={1} flexGrow={1}>
        {link.connector ? (
          link.url ? (
            <Link
              data-cy="cardLink"
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {link.key}
            </Link>
          ) : (
            <Typography data-cy="cardLink" level="body-xs">
              {link.key}
            </Typography>
          )
        ) : (
          <RouterLink
            data-cy="cardLink"
            to={`/cards/${link.key}`}
            style={{ display: 'flex' }}
          >
            <Link component="div" fontSize="xs" fontWeight="bold">
              {link.key}
            </Link>
          </RouterLink>
        )}
        <Divider orientation="vertical" />
        <Typography data-cy="cardLinkTitle" level="body-xs">
          {link.title}
        </Typography>
        {link.linkDescription && (
          <>
            <Typography level="body-xs" color="neutral">
              —
            </Typography>
            <Typography
              data-cy="cardLinkDescription"
              level="body-xs"
              color="neutral"
            >
              {link.linkDescription}
            </Typography>
          </>
        )}
      </Stack>
    </Stack>
  );
}
