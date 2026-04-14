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

import { useTranslation } from 'react-i18next';
import { useAppSelector } from '@/lib/hooks';
import { Button, Sheet, Stack, Typography } from '@mui/joy';

export default function SessionExpiredBanner() {
  const sessionExpired = useAppSelector(
    (state) => state.session.sessionExpired,
  );
  const { t } = useTranslation();

  if (!sessionExpired) return null;

  return (
    <Sheet
      color="danger"
      variant="solid"
      sx={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 'snackbar',
        py: 1.5,
        px: 3,
        boxShadow: 'md',
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="center"
        gap={1.5}
      >
        <Typography level="body-sm" textColor="inherit">
          {t('sessionExpired')}
        </Typography>
        <Button
          size="sm"
          variant="solid"
          color="neutral"
          sx={{ bgcolor: 'background.body', color: 'danger.500' }}
          onClick={() => window.location.reload()}
        >
          {t('sessionExpiredLogIn')}
        </Button>
      </Stack>
    </Sheet>
  );
}
