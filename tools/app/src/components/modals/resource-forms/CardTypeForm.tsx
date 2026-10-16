// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { Controller } from 'react-hook-form';
import {
  FormControl,
  FormLabel,
  FormHelperText,
  Select,
  Option,
} from '@mui/joy';
import { useTranslation } from 'react-i18next';
import type { Workflow } from '@cyberismo/model';
import type { ResourceFormProps } from './BaseResourceModal';
import type { CreateCardTypeData } from '@/lib/definitions';
import BaseCreateForm from './BaseCreateForm';
import IdentifierField from './IdentifierField';

interface CardTypeFormProps extends ResourceFormProps<CreateCardTypeData> {
  workflows: Workflow[];
}

export function CardTypeForm({
  onSubmit,
  isSubmitting,
  workflows,
}: CardTypeFormProps) {
  const { t } = useTranslation();
  if (workflows.length === 0) {
    return (
      <FormHelperText sx={{ color: 'warning.main' }}>
        {t('newResourceModal.noWorkflows')}
      </FormHelperText>
    );
  }

  return (
    <BaseCreateForm
      defaultValues={{
        identifier: '',
        workflowName: workflows.length > 0 ? workflows[0].name : '',
      }}
      onSubmit={onSubmit}
      isSubmitting={isSubmitting}
      resourceTypeLabel={t('newResourceModal.cardTypes.name')}
    >
      {({ control, errors }) => (
        <>
          <IdentifierField control={control} type="cardTypes" />

          <Controller
            name="workflowName"
            control={control}
            rules={{ required: true }}
            render={({ field }) => (
              <FormControl error={!!errors.workflowName}>
                <FormLabel required>
                  {t('newResourceModal.workflows.name')}
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
                  {errors.workflowName?.message || ''}
                </FormHelperText>
              </FormControl>
            )}
          />
        </>
      )}
    </BaseCreateForm>
  );
}

export default CardTypeForm;
