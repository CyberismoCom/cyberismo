// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

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
