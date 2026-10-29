// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { useTranslation } from 'react-i18next';
import { createLinkType, useProject } from '@/lib/api';
import { BaseResourceModal } from './BaseResourceModal';
import { LinkTypeForm } from './LinkTypeForm';
import type { CreateLinkTypeData } from '@/lib/definitions';

interface NewLinkTypeModalProps {
  open: boolean;
  onClose: () => void;
}

export function NewLinkTypeModal({ open, onClose }: NewLinkTypeModalProps) {
  const { t } = useTranslation();
  const { project } = useProject();

  const handleCreate = async (data: CreateLinkTypeData) => {
    await createLinkType(data);
    return `${project?.prefix}/linkTypes/${data.identifier}`;
  };

  return (
    <BaseResourceModal
      open={open}
      onClose={onClose}
      title={t('newResourceModal.linkTypes.name')}
      createFn={handleCreate}
      FormComponent={LinkTypeForm}
    />
  );
}

export default NewLinkTypeModal;
