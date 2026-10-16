// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { useTranslation } from 'react-i18next';
import type { ResourceFormProps } from './BaseResourceModal';
import type { CreateSkillData } from '@/lib/definitions';
import BaseCreateForm from './BaseCreateForm';
import IdentifierField from './IdentifierField';

export function SkillForm({
  onSubmit,
  isSubmitting,
}: ResourceFormProps<CreateSkillData>) {
  const { t } = useTranslation();
  return (
    <BaseCreateForm<CreateSkillData>
      defaultValues={{ identifier: '' }}
      onSubmit={onSubmit}
      isSubmitting={isSubmitting}
      resourceTypeLabel={t('newResourceModal.skills.name')}
    >
      {({ control }) => (
        <IdentifierField<CreateSkillData> control={control} type="skills" />
      )}
    </BaseCreateForm>
  );
}

export default SkillForm;
