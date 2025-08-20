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

import { useForm, Controller } from 'react-hook-form';
import {
  Stack,
  FormControl,
  FormLabel,
  Input,
  Select,
  Option,
  Button,
  FormHelperText,
} from '@mui/joy';
import { useTranslation } from 'react-i18next';
import { DataType } from '@cyberismo/data-handler/interfaces/resource-interfaces';
import { ResourceFormProps } from './BaseResourceModal';
import ProjectIdentifier from './Identifier';
import { DATA_TYPES } from '@/lib/constants';

interface FieldTypeFormData {
  identifier: string;
  dataType: DataType;
}

export function FieldTypeForm({
  onSubmit,
  isSubmitting,
}: ResourceFormProps<FieldTypeFormData>) {
  const { t } = useTranslation();
  const {
    control,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<FieldTypeFormData>({
    mode: 'onChange',
    defaultValues: {
      identifier: '',
      dataType: 'shortText',
    },
  });

  const onFormSubmit = async (data: FieldTypeFormData) => {
    await onSubmit(data);
  };

  return (
    <form onSubmit={handleSubmit(onFormSubmit)}>
      <Stack spacing={2}>
        <Controller
          name="identifier"
          control={control}
          rules={{
            required: t('newResourceModal.required', {
              field: t('newResourceModal.identifier'),
            }),
          }}
          render={({ field }) => (
            <FormControl error={!!errors.identifier}>
              <FormLabel required>{t('newResourceModal.identifier')}</FormLabel>
              <Input
                {...field}
                error={!!errors.identifier}
                startDecorator={<ProjectIdentifier type="fieldTypes" />}
              />
              <FormHelperText sx={{ minHeight: '1.5em' }}>
                {errors.identifier?.message || ' '}
              </FormHelperText>
            </FormControl>
          )}
        />

        <Controller
          name="dataType"
          control={control}
          rules={{
            required: true,
          }}
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
                {errors.dataType?.message || ' '}
              </FormHelperText>
            </FormControl>
          )}
        />

        <Button
          type="submit"
          color="primary"
          loading={isSubmitting}
          disabled={!isValid}
          sx={{ mt: 2 }}
        >
          {t('newResourceModal.create', {
            resourceType: t('newResourceModal.fieldTypes.name'),
          })}
        </Button>
      </Stack>
    </form>
  );
}

export default FieldTypeForm;
