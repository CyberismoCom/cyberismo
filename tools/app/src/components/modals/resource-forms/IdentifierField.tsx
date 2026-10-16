// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { Controller, type Control, type Path } from 'react-hook-form';
import { FormControl, FormLabel, Input, FormHelperText } from '@mui/joy';
import { useTranslation } from 'react-i18next';
import ProjectIdentifier from './Identifier';

export interface IdentifierFieldProps<TForm extends { identifier: string }> {
  control: Control<TForm>;
  type: string;
}

export function IdentifierField<TForm extends { identifier: string }>({
  control,
  type,
}: IdentifierFieldProps<TForm>) {
  const { t } = useTranslation();
  return (
    <Controller
      name={'identifier' as Path<TForm>}
      control={control}
      rules={{
        required: t('newResourceModal.required', {
          field: t('newResourceModal.identifier'),
        }) as string,
      }}
      render={({ field, fieldState }) => (
        <FormControl error={!!fieldState.error}>
          <FormLabel required>{t('newResourceModal.identifier')}</FormLabel>
          <Input
            {...field}
            error={!!fieldState.error}
            startDecorator={<ProjectIdentifier type={type} />}
          />
          <FormHelperText sx={{ minHeight: '1.5em' }}>
            {fieldState.error?.message || ' '}
          </FormHelperText>
        </FormControl>
      )}
    />
  );
}

export default IdentifierField;
