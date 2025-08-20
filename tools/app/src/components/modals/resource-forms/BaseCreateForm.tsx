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

import { ReactNode } from 'react';
import {
  useForm,
  type Control,
  type DefaultValues,
  type FieldErrors,
  type FieldValues,
  type SubmitHandler,
} from 'react-hook-form';
import { Stack, Button } from '@mui/joy';
import { useTranslation } from 'react-i18next';
import { type ResourceFormProps } from './BaseResourceModal';

export interface BaseCreateFormProps<TFieldValues extends FieldValues>
  extends ResourceFormProps<TFieldValues> {
  defaultValues: DefaultValues<TFieldValues>;
  resourceTypeLabel: string;
  children: (ctx: {
    control: Control<TFieldValues>;
    errors: FieldErrors<TFieldValues>;
    isValid: boolean;
  }) => ReactNode;
}

export function BaseCreateForm<TFieldValues extends FieldValues>({
  defaultValues,
  onSubmit,
  isSubmitting,
  resourceTypeLabel,
  children,
}: BaseCreateFormProps<TFieldValues>) {
  const { t } = useTranslation();
  const {
    control,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<TFieldValues>({
    mode: 'onChange',
    defaultValues,
  });

  const submitHandler: SubmitHandler<TFieldValues> = async (data) => {
    await onSubmit(data);
  };

  return (
    <form onSubmit={handleSubmit(submitHandler)}>
      <Stack spacing={2}>
        {children({ control, errors, isValid })}

        <Button
          type="submit"
          color="primary"
          loading={isSubmitting}
          disabled={!isValid}
          sx={{ mt: 2 }}
        >
          {t('newResourceModal.create', { resourceType: resourceTypeLabel })}
        </Button>
      </Stack>
    </form>
  );
}

export default BaseCreateForm;
