// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { useTranslation } from 'react-i18next';
import { createSkill, useProjectSettings } from '@/lib/api';
import { BaseResourceModal } from './BaseResourceModal';
import { SkillForm } from './SkillForm';
import type { CreateSkillData } from '@/lib/definitions';

interface NewSkillModalProps {
  open: boolean;
  onClose: () => void;
}

export function NewSkillModal({ open, onClose }: NewSkillModalProps) {
  const { t } = useTranslation();
  const { general } = useProjectSettings();

  const handleCreate = async (data: CreateSkillData) => {
    await createSkill(data);
    return `${general?.cardKeyPrefix}/skills/${data.identifier}`;
  };

  return (
    <BaseResourceModal
      open={open}
      onClose={onClose}
      title={t('newResourceModal.skills.name')}
      createFn={handleCreate}
      FormComponent={SkillForm}
    />
  );
}

export default NewSkillModal;
