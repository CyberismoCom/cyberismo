// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { ReactNode } from 'react';
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

export interface BaseCreateFormProps<
  TFieldValues extends FieldValues,
> extends ResourceFormProps<TFieldValues> {
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
