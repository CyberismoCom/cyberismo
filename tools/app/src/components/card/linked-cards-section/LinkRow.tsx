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

import { Box, Divider, Link, Stack, Tooltip, Typography } from '@mui/joy';
import { Link as RouterLink } from 'react-router';
import { useTranslation } from 'react-i18next';
import LockOutlined from '@mui/icons-material/LockOutlined';
import type { CalculationLink } from '@cyberismo/data-handler/types/queries';

type LinkRowProps = {
  link: CalculationLink;
  locked?: boolean;
};

export function LinkRow({ link, locked = false }: LinkRowProps) {
  const { t } = useTranslation();
  return (
    <Stack
      direction={{ xs: 'column', md: 'row' }}
      alignItems={{ xs: 'stretch', md: 'center' }}
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
        sx={{
          width: { xs: '100%', md: '40%' },
          maxWidth: { md: 150 },
          flexShrink: 0,
          whiteSpace: 'normal',
          position: 'relative',
        }}
      >
        {link.displayName}
      </Typography>
      <Stack direction="row" alignItems="center" gap={1} flexGrow={1}>
        <Box
          sx={{
            width: 110,
            flexShrink: 0,
            fontFamily: 'code',
            fontSize: 'xs',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {link.connector ? (
            link.url ? (
              <Link
                data-cy="cardLink"
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                sx={{
                  display: 'inline',
                  fontFamily: 'inherit',
                  fontSize: 'inherit',
                }}
              >
                {link.key}
              </Link>
            ) : (
              <Typography
                data-cy="cardLink"
                level="body-xs"
                component="span"
                sx={{ fontFamily: 'inherit' }}
              >
                {link.key}
              </Typography>
            )
          ) : (
            <RouterLink data-cy="cardLink" to={`/cards/${link.key}`}>
              <Link
                component="span"
                fontSize="xs"
                fontWeight="bold"
                sx={{ display: 'inline', fontFamily: 'inherit' }}
              >
                {link.key}
              </Link>
            </RouterLink>
          )}
        </Box>
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
        {locked && (
          <Tooltip title={t('linkForm.calculatedLink')} disableInteractive>
            <LockOutlined
              data-cy="cardLinkLocked"
              sx={{
                height: 14,
                width: 14,
                ml: 'auto',
                color: 'neutral.500',
              }}
            />
          </Tooltip>
        )}
      </Stack>
    </Stack>
  );
}
