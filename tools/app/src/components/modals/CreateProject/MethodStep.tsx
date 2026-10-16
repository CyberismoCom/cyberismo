// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { Radio, Stack, Typography } from '@mui/joy';
import { useTranslation } from 'react-i18next';
import { OptionCard, OptionCardGrid } from '@/components/OptionCard';

interface MethodStepProps {
  onSelect: (method: 'clone' | 'create') => void;
}

export function MethodStep({ onSelect }: MethodStepProps) {
  const { t } = useTranslation();

  return (
    <Stack spacing={2} sx={{ mt: 1 }}>
      <Typography level="title-md">
        {t('projectDialog.selectMethod')}
      </Typography>
      <OptionCardGrid>
        <OptionCard
          title={t('projectDialog.cloneFromRepo')}
          caption={t('projectDialog.cloneDescription')}
          action={
            <Radio
              checked={false}
              readOnly
              variant="soft"
              tabIndex={-1}
              sx={{ pointerEvents: 'none' }}
            />
          }
          onClick={() => onSelect('clone')}
        />
        <OptionCard
          title={t('projectDialog.createFromScratch')}
          caption={t('projectDialog.createDescription')}
          action={
            <Radio
              checked={false}
              readOnly
              variant="soft"
              tabIndex={-1}
              sx={{ pointerEvents: 'none' }}
            />
          }
          onClick={() => onSelect('create')}
        />
      </OptionCardGrid>
    </Stack>
  );
}
