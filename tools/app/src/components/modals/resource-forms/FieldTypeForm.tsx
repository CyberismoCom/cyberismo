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
import {
  Stack,
  Select,
  Option,
  FormControl,
  FormLabel,
  FormHelperText,
} from '@mui/joy';
import { useTranslation } from 'react-i18next';
import type { DataType } from '@cyberismo/data-handler/interfaces/resource-interfaces';
import type { ResourceFormProps } from './BaseResourceModal';
import { DATA_TYPES } from '@/lib/constants';
import BaseCreateForm from './BaseCreateForm';
import IdentifierField from './IdentifierField';

interface FieldTypeFormData {
  identifier: string;
  dataType: DataType;
}

export function FieldTypeForm({
  onSubmit,
  isSubmitting,
}: ResourceFormProps<FieldTypeFormData>) {
  const { t } = useTranslation();

  return (
    <BaseCreateForm
      defaultValues={{ identifier: '', dataType: 'shortText' }}
      onSubmit={onSubmit}
      isSubmitting={isSubmitting}
      resourceTypeLabel={t('newResourceModal.fieldTypes.name')}
    >
      {({ control, errors }) => (
        <Stack spacing={2}>
          <IdentifierField control={control} type="fieldTypes" />

          <Controller
            name="dataType"
            control={control}
            rules={{ required: true }}
            render={({ field }) => (
              <FormControl error={!!errors.dataType}>
                <FormLabel required>{t('dataType')}</FormLabel>
                <Select
                  value={field.value}
                  onChange={(_, value) => field.onChange(value)}
                  onBlur={field.onBlur}
                >
                  {DATA_TYPES.map((option) => (
                    <Option key={option} value={option}>
                      {t(`dataTypes.${option}`)}
                    </Option>
                  ))}
                </Select>
                <FormHelperText sx={{ minHeight: '1.5em' }}>
                  {errors.dataType?.message || ''}
                </FormHelperText>
              </FormControl>
            )}
          />
        </Stack>
      )}
    </BaseCreateForm>
  );
}

export default FieldTypeForm;
