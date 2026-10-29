// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { useTranslation } from 'react-i18next';
import { createGraphModel, useProject } from '@/lib/api';
import { BaseResourceModal } from './BaseResourceModal';
import { GraphModelForm } from './GraphModelForm';
import type { CreateGraphModelData } from '@/lib/definitions';

interface NewGraphModelModalProps {
  open: boolean;
  onClose: () => void;
}

export function NewGraphModelModal({ open, onClose }: NewGraphModelModalProps) {
  const { t } = useTranslation();
  const { project } = useProject();

  const handleCreate = async (data: CreateGraphModelData) => {
    await createGraphModel(data);
    return `${project?.prefix}/graphModels/${data.identifier}`;
  };

  return (
    <BaseResourceModal
      open={open}
      onClose={onClose}
      title={t('newResourceModal.graphModels.name')}
      createFn={handleCreate}
      FormComponent={GraphModelForm}
    />
  );
}

export default NewGraphModelModal;
