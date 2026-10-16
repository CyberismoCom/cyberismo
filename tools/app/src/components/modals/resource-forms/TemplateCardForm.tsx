// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

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

export function TemplateCardForm({
  onSubmit,
  isSubmitting,
}: ResourceFormProps<CreateTemplateCardData>) {
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
