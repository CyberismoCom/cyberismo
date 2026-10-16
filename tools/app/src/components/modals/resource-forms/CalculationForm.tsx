// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { useTranslation } from 'react-i18next';
import type { ResourceFormProps } from './BaseResourceModal';
import type { CreateCalculationData } from '@/lib/definitions';
import BaseCreateForm from './BaseCreateForm';
import IdentifierField from './IdentifierField';

export function CalculationForm({
  onSubmit,
  isSubmitting,
}: ResourceFormProps<CreateCalculationData>) {
  const { t } = useTranslation();

  return (
    <BaseCreateForm
      defaultValues={{ identifier: '' }}
      onSubmit={onSubmit}
      isSubmitting={isSubmitting}
      resourceTypeLabel={t('newResourceModal.calculations.name')}
    >
      {({ control }) => (
        <IdentifierField control={control} type="calculations" />
      )}
    </BaseCreateForm>
  );
}

export default CalculationForm;
