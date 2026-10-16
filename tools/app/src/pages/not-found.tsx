// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

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
