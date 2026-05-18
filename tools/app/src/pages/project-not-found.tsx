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

import { useEffect } from 'react';
import { Stack, Button, Typography } from '@mui/joy';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useDispatch } from 'react-redux';
import { clearProjectPrefix } from '@/lib/slices/project.js';

export default function ProjectNotFoundPage() {
  const { t } = useTranslation();
  const dispatch = useDispatch();

  useEffect(() => {
    dispatch(clearProjectPrefix());
  }, [dispatch]);

  return (
    <Stack
      direction="column"
      alignItems="center"
      justifyContent="center"
      height="100%"
      gap={4}
    >
      <Typography level="h1">{t('projectNotFound.title')}</Typography>
      <Typography level="title-lg" sx={{ textAlign: 'center' }}>
        {t('projectNotFound.description')}
      </Typography>
      <Button size="sm" component={Link} to="/" sx={{ mt: 2 }}>
        {t('projectNotFound.browseProjects')}
      </Button>
      <img
        src="/images/broken_link.svg"
        alt=""
        style={{ maxWidth: '400px', width: '80%' }}
      />
    </Stack>
  );
}
