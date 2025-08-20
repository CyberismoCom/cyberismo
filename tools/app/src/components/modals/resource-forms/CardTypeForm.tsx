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
  FormControl,
  FormLabel,
  FormHelperText,
  Select,
  Option,
} from '@mui/joy';
import { useTranslation } from 'react-i18next';
import { Workflow } from '@cyberismo/data-handler/interfaces/resource-interfaces';
import { ResourceFormProps } from './BaseResourceModal';
import { CreateCardTypeData } from '@/lib/definitions';
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
