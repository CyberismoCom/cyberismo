// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { useTranslation } from 'react-i18next';
import { createFieldType, useProject } from '@/lib/api';
import { BaseResourceModal } from './BaseResourceModal';
import type { CreateFieldTypeData } from '@/lib/definitions';
import { FieldTypeForm } from './FieldTypeForm';

interface NewFieldTypeModalProps {
  open: boolean;
  onClose: () => void;
}

export function NewFieldTypeModal({ open, onClose }: NewFieldTypeModalProps) {
  const { t } = useTranslation();
  const { project } = useProject();

  const handleCreate = async (data: CreateFieldTypeData) => {
    await createFieldType(data);
    return `${project?.prefix}/fieldTypes/${data.identifier}`;
  };

  return (
    <BaseResourceModal
      open={open}
      onClose={onClose}
      title={t('newResourceModal.fieldTypes.name')}
      createFn={handleCreate}
      FormComponent={FieldTypeForm}
    />
  );
}

export default NewFieldTypeModal;
