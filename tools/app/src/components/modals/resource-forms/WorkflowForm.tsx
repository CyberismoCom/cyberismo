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
  Button,
  FormHelperText,
} from '@mui/joy';
import { useTranslation } from 'react-i18next';
import { ResourceFormProps } from './BaseResourceModal';
import { CreateWorkflowData } from '@/lib/definitions';
import ProjectIdentifier from './Identifier';

export function WorkflowForm({
  onSubmit,
  isSubmitting,
}: ResourceFormProps<CreateWorkflowData>) {
  const { t } = useTranslation();
  const {
    control,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<CreateWorkflowData>({
    mode: 'onChange',
    defaultValues: {
      identifier: '',
    },
  });

  const onFormSubmit = async (data: CreateWorkflowData) => {
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
                startDecorator={<ProjectIdentifier type="workflows" />}
              />
              <FormHelperText sx={{ minHeight: '1.5em' }}>
                {errors.identifier?.message || ' '}
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
            resourceType: t('newResourceModal.workflows.name'),
          })}
        </Button>
      </Stack>
    </form>
  );
}

export default WorkflowForm;
