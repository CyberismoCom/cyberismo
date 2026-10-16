// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { useTranslation } from 'react-i18next';
import { createTemplate, useProject } from '@/lib/api';
import { BaseResourceModal } from './BaseResourceModal';
import { TemplateForm } from './TemplateForm';
import type { CreateTemplateData } from '@/lib/definitions';

interface NewTemplateModalProps {
  open: boolean;
  onClose: () => void;
}

export function NewTemplateModal({ open, onClose }: NewTemplateModalProps) {
  const { t } = useTranslation();
  const { project } = useProject();

  const handleCreate = async (data: CreateTemplateData) => {
    await createTemplate(data);
    return `${project?.prefix}/templates/${data.identifier}`;
  };

  return (
    <BaseResourceModal
      open={open}
      onClose={onClose}
      title={t('newResourceModal.templates.name')}
      createFn={handleCreate}
      FormComponent={TemplateForm}
    />
  );
}

export default NewTemplateModal;
