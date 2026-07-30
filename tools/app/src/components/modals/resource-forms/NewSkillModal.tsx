/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

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
