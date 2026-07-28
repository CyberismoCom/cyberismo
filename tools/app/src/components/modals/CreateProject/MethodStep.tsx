/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

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
