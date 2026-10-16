// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { useTranslation } from 'react-i18next';
import type { ResourceFormProps } from './BaseResourceModal';
import type { CreateGraphModelData } from '@/lib/definitions';
import BaseCreateForm from './BaseCreateForm';
import IdentifierField from './IdentifierField';

export function GraphModelForm({
  onSubmit,
  isSubmitting,
}: ResourceFormProps<CreateGraphModelData>) {
  const { t } = useTranslation();
  return (
    <BaseCreateForm
      defaultValues={{ identifier: '' }}
      onSubmit={onSubmit}
      isSubmitting={isSubmitting}
      resourceTypeLabel={t('newResourceModal.graphModels.name')}
    >
      {({ control }) => (
        <IdentifierField control={control} type="graphModels" />
      )}
    </BaseCreateForm>
  );
}

export default GraphModelForm;
