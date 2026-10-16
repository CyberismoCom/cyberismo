// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { useTranslation } from 'react-i18next';
import { createReport, useProject } from '@/lib/api';
import { BaseResourceModal } from './BaseResourceModal';
import { ReportForm } from './ReportForm';
import type { CreateReportData } from '@/lib/definitions';

interface NewReportModalProps {
  open: boolean;
  onClose: () => void;
}

export function NewReportModal({ open, onClose }: NewReportModalProps) {
  const { t } = useTranslation();
  const { project } = useProject();

  const handleCreate = async (data: CreateReportData) => {
    await createReport(data);
    return `${project?.prefix}/reports/${data.identifier}`;
  };

  return (
    <BaseResourceModal
      open={open}
      onClose={onClose}
      title={t('newResourceModal.reports.name')}
      createFn={handleCreate}
      FormComponent={ReportForm}
    />
  );
}

export default NewReportModal;
