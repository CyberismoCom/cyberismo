// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { useTranslation } from 'react-i18next';
import { createWorkflow, useProject } from '@/lib/api';
import { BaseResourceModal } from './BaseResourceModal';
import { WorkflowForm } from './WorkflowForm';
import type { CreateWorkflowData } from '@/lib/definitions';

interface NewWorkflowModalProps {
  open: boolean;
  onClose: () => void;
}

export function NewWorkflowModal({ open, onClose }: NewWorkflowModalProps) {
  const { t } = useTranslation();
  const { project } = useProject();

  const handleCreate = async (data: CreateWorkflowData) => {
    await createWorkflow(data);
    return `${project?.prefix}/workflows/${data.identifier}`;
  };

  return (
    <BaseResourceModal
      open={open}
      onClose={onClose}
      title={t('newResourceModal.workflows.name')}
      createFn={handleCreate}
      FormComponent={WorkflowForm}
    />
  );
}

export default NewWorkflowModal;
