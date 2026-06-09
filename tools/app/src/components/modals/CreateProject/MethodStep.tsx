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

import { Stack, Typography } from '@mui/joy';
import { useTranslation } from 'react-i18next';
import { CategoryOption } from '../OptionCards';

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
      <CategoryOption
        onOptionSelect={(name) =>
          onSelect(name === 'clone' ? 'clone' : 'create')
        }
        options={[
          {
            name: 'clone',
            displayName: t('projectDialog.cloneFromRepo'),
            description: t('projectDialog.cloneDescription'),
            isChosen: false,
          },
          {
            name: 'create',
            displayName: t('projectDialog.createFromScratch'),
            description: t('projectDialog.createDescription'),
            isChosen: false,
          },
        ]}
      />
    </Stack>
  );
}
