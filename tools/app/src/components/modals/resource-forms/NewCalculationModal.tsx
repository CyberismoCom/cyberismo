// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { useTranslation } from 'react-i18next';
import { createCalculation, useProject } from '@/lib/api';
import { BaseResourceModal } from './BaseResourceModal';
import { CalculationForm } from './CalculationForm';
import type { CreateCalculationData } from '@/lib/definitions';

interface NewCalculationModalProps {
  open: boolean;
  onClose: () => void;
}

export function NewCalculationModal({
  open,
  onClose,
}: NewCalculationModalProps) {
  const { t } = useTranslation();
  const { project } = useProject();

  const handleCreate = async (data: CreateCalculationData) => {
    await createCalculation(data);
    return `${project?.prefix}/calculations/${data.identifier}`;
  };

  return (
    <BaseResourceModal
      open={open}
      onClose={onClose}
      title={t('newResourceModal.calculations.name')}
      createFn={handleCreate}
      FormComponent={CalculationForm}
    />
  );
}

export default NewCalculationModal;
