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

import { Stack, Button, Typography } from '@mui/joy';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

export default function NotFoundPage() {
  const { t } = useTranslation();

  return (
    <Stack
      direction="column"
      alignItems="center"
      justifyContent="center"
      height="100%"
      gap={4}
    >
      <Typography level="h1">{t('notFound.title')}</Typography>
      <Typography level="title-lg" sx={{ textAlign: 'center' }}>
        {t('notFound.description')}
      </Typography>
      <Button size="sm" component={Link} to="/cards" sx={{ mt: 2 }}>
        {t('notFound.goHome')}
      </Button>
      <img
        src="/images/broken_link.svg"
        alt=""
        style={{ maxWidth: '400px', width: '80%' }}
      />
    </Stack>
  );
}
