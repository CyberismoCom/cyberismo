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

import { useMemo } from 'react';
import { Controller } from 'react-hook-form';
import { FormControl, FormLabel, Select, Option } from '@mui/joy';
import { useTranslation } from 'react-i18next';
import { useProject } from '@/lib/api';
import BaseCreateForm from './BaseCreateForm';
import { type ResourceFormProps } from './BaseResourceModal';

export interface CreateTemplateCardData {
  cardType: string;
}

interface TemplateCardFormProps
  extends ResourceFormProps<CreateTemplateCardData> {}

export function TemplateCardForm({
  onSubmit,
  isSubmitting,
}: TemplateCardFormProps) {
  const { t } = useTranslation();
  const { project } = useProject();

  const options = useMemo(() => {
    const arr = (project?.cardTypes || []).map((ct) => ({
      value: ct.name,
      label: `${ct.displayName || '-'} (${ct.name})`,
    }));
    arr.sort((a, b) => a.label.localeCompare(b.label));
    return arr;
  }, [project]);

  return (
    <BaseCreateForm<CreateTemplateCardData>
      defaultValues={{ cardType: options[0]?.value || '' }}
      onSubmit={onSubmit}
      isSubmitting={isSubmitting}
      resourceTypeLabel={t('templateCard')}
    >
      {({ control }) => (
        <Controller
          name="cardType"
          control={control}
          rules={{ required: true }}
          render={({ field }) => (
            <FormControl>
              <FormLabel required>{t('cardType')}</FormLabel>
              <Select
                value={field.value}
                onChange={(_, value) => field.onChange(value)}
                onBlur={field.onBlur}
              >
                {options.map((opt) => (
                  <Option key={opt.value} value={opt.value}>
                    {opt.label}
                  </Option>
                ))}
              </Select>
            </FormControl>
          )}
        />
      )}
    </BaseCreateForm>
  );
}

export default TemplateCardForm;
