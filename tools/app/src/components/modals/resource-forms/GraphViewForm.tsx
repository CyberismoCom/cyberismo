// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { useTranslation } from 'react-i18next';
import type { ResourceFormProps } from './BaseResourceModal';
import type { CreateGraphViewData } from '@/lib/definitions';
import BaseCreateForm from './BaseCreateForm';
import IdentifierField from './IdentifierField';

export function GraphViewForm({
  onSubmit,
  isSubmitting,
}: ResourceFormProps<CreateGraphViewData>) {
  const { t } = useTranslation();
  return (
    <BaseCreateForm
      defaultValues={{ identifier: '' }}
      onSubmit={onSubmit}
      isSubmitting={isSubmitting}
      resourceTypeLabel={t('newResourceModal.graphViews.name')}
    >
      {({ control }) => <IdentifierField control={control} type="graphViews" />}
    </BaseCreateForm>
  );
}

export default GraphViewForm;
