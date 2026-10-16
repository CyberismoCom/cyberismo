// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { useTranslation } from 'react-i18next';
import { createCardType, useProject } from '@/lib/api';
import { BaseResourceModal } from './BaseResourceModal';
import { CardTypeForm } from './CardTypeForm';
import type { CreateCardTypeData } from '@/lib/definitions';

interface NewCardTypeModalProps {
  open: boolean;
  onClose: () => void;
}

export function NewCardTypeModal({ open, onClose }: NewCardTypeModalProps) {
  const { t } = useTranslation();
  const { project } = useProject();

  const handleCreate = async (data: CreateCardTypeData) => {
    await createCardType(data);
    return `${project?.prefix}/cardTypes/${data.identifier}`;
  };

  return (
    <BaseResourceModal
      open={open}
      onClose={onClose}
      title={t('newResourceModal.cardTypes.name')}
      createFn={handleCreate}
      FormComponent={CardTypeForm}
      FormComponentProps={{
        workflows: project?.workflows || [],
      }}
    />
  );
}

export default NewCardTypeModal;
