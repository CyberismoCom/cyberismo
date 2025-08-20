/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2025
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { Controller } from 'react-hook-form';
import { FormControl, FormLabel, Input, FormHelperText } from '@mui/joy';
import { useTranslation } from 'react-i18next';
import { ResourceFormProps } from './BaseResourceModal';
import { CreateCalculationData } from '@/lib/definitions';
import BaseCreateForm from './BaseCreateForm';

export function CalculationForm({
  onSubmit,
  isSubmitting,
}: ResourceFormProps<CreateCalculationData>) {
  const { t } = useTranslation();

  return (
    <BaseCreateForm
      defaultValues={{ fileName: '' }}
      onSubmit={onSubmit}
      isSubmitting={isSubmitting}
      resourceTypeLabel={t('newResourceModal.calculations.name')}
    >
      {({ control, errors }) => (
        <Controller
          name="fileName"
          control={control}
          rules={{
            required: t('newResourceModal.required', {
              field: 'File name',
            }),
          }}
          render={({ field }) => (
            <FormControl error={!!errors.fileName}>
              <FormLabel required>{t('newResourceModal.fileName')}</FormLabel>
              <Input {...field} error={!!errors.fileName} endDecorator=".lp" />
              <FormHelperText sx={{ minHeight: '1.5em' }}>
                {errors.fileName?.message}
              </FormHelperText>
            </FormControl>
          )}
        />
      )}
    </BaseCreateForm>
  );
}

export default CalculationForm;
