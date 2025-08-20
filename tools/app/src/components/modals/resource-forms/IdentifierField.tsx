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
