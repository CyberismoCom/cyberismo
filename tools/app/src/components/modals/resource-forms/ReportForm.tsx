// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { useTranslation } from 'react-i18next';
import type { ResourceFormProps } from './BaseResourceModal';
import type { CreateReportData } from '@/lib/definitions';
import BaseCreateForm from './BaseCreateForm';
import IdentifierField from './IdentifierField';

export function ReportForm({
  onSubmit,
  isSubmitting,
}: ResourceFormProps<CreateReportData>) {
  const { t } = useTranslation();
  return (
    <BaseCreateForm<CreateReportData>
      defaultValues={{ identifier: '' }}
      onSubmit={onSubmit}
      isSubmitting={isSubmitting}
      resourceTypeLabel={t('newResourceModal.reports.name')}
    >
      {({ control }) => (
        <IdentifierField<CreateReportData> control={control} type="reports" />
      )}
    </BaseCreateForm>
  );
}

export default ReportForm;
