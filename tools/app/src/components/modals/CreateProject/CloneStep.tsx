// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { FormControl, FormLabel, Input, Stack, Typography } from '@mui/joy';
import { useTranslation } from 'react-i18next';

interface CloneStepProps {
  url: string;
  onUrlChange: (url: string) => void;
  disabled: boolean;
}

export function CloneStep({ url, onUrlChange, disabled }: CloneStepProps) {
  const { t } = useTranslation();

  return (
    <Stack spacing={2} sx={{ mt: 1 }}>
      <Typography level="title-md">{t('projectDialog.repoTitle')}</Typography>
      <FormControl>
        <FormLabel>{t('projectDialog.repoUrl')} *</FormLabel>
        <Input
          autoFocus
          placeholder={t('projectDialog.repoUrlPlaceholder')}
          value={url}
          onChange={(e) => onUrlChange(e.target.value)}
          disabled={disabled}
        />
      </FormControl>
    </Stack>
  );
}
