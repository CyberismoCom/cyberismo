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
  Select,
  Option,
} from '@mui/joy';
import { useTranslation } from 'react-i18next';
import { Workflow } from '@cyberismo/data-handler/interfaces/resource-interfaces';
import { ResourceFormProps } from './BaseResourceModal';
import { CreateCardTypeData } from '@/lib/definitions';
import ProjectIdentifier from './Identifier';

interface CardTypeFormProps extends ResourceFormProps<CreateCardTypeData> {
  workflows: Workflow[];
}

export function CardTypeForm({
  onSubmit,
  isSubmitting,
  workflows,
}: CardTypeFormProps) {
  const { t } = useTranslation();
  const {
    control,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<CreateCardTypeData>({
    mode: 'onChange',
    defaultValues: {
      identifier: '',
      workflowName: workflows.length > 0 ? workflows[0].name : '',
    },
  });

  const onFormSubmit = async (data: CreateCardTypeData) => {
    await onSubmit(data);
  };

  if (workflows.length === 0) {
    return (
      <Stack spacing={2}>
        <FormHelperText sx={{ color: 'warning.main' }}>
          {t('newResourceModal.noWorkflows')}
        </FormHelperText>
      </Stack>
    );
  }

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
                startDecorator={<ProjectIdentifier type="cardTypes" />}
              />
              <FormHelperText sx={{ minHeight: '1.5em' }}>
                {errors.identifier?.message || ' '}
              </FormHelperText>
            </FormControl>
          )}
        />

        <Controller
          name="workflowName"
          control={control}
          rules={{
            required: true,
          }}
          render={({ field }) => (
            <FormControl error={!!errors.workflowName}>
              <FormLabel>
                Workflow <span style={{ color: 'red' }}>*</span>
              </FormLabel>
              <Select
                value={field.value}
                onChange={(_, value) => field.onChange(value)}
                onBlur={field.onBlur}
              >
                {workflows.map((workflow) => (
                  <Option key={workflow.name} value={workflow.name}>
                    {workflow.displayName || workflow.name}
                  </Option>
                ))}
              </Select>
              <FormHelperText sx={{ minHeight: '1.5em' }}>
                {errors.workflowName?.message || ' '}
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
            resourceType: t('newResourceModal.cardTypes.name'),
          })}
        </Button>
      </Stack>
    </form>
  );
}

export default CardTypeForm;
