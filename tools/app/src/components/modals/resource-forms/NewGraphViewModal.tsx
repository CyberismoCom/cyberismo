// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { useTranslation } from 'react-i18next';
import { createGraphView, useProject } from '@/lib/api';
import { BaseResourceModal } from './BaseResourceModal';
import { GraphViewForm } from './GraphViewForm';
import type { CreateGraphViewData } from '@/lib/definitions';

interface NewGraphViewModalProps {
  open: boolean;
  onClose: () => void;
}

export function NewGraphViewModal({ open, onClose }: NewGraphViewModalProps) {
  const { t } = useTranslation();
  const { project } = useProject();

  const handleCreate = async (data: CreateGraphViewData) => {
    await createGraphView(data);
    return `${project?.prefix}/graphViews/${data.identifier}`;
  };

  return (
    <BaseResourceModal
      open={open}
      onClose={onClose}
      title={t('newResourceModal.graphViews.name')}
      createFn={handleCreate}
      FormComponent={GraphViewForm}
      FormComponentProps={{}}
    />
  );
}

export default NewGraphViewModal;
