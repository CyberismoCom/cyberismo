// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { useTranslation } from 'react-i18next';
import type { ResourceFormProps } from './BaseResourceModal';
import type { CreateTemplateData } from '@/lib/definitions';
import BaseCreateForm from './BaseCreateForm';
import IdentifierField from './IdentifierField';

export function TemplateForm({
  onSubmit,
  isSubmitting,
}: ResourceFormProps<CreateTemplateData>) {
  const { t } = useTranslation();
  return (
    <BaseCreateForm
      defaultValues={{ identifier: '' }}
      onSubmit={onSubmit}
      isSubmitting={isSubmitting}
      resourceTypeLabel={t('newResourceModal.templates.name')}
    >
      {({ control }) => <IdentifierField control={control} type="templates" />}
    </BaseCreateForm>
  );
}

export default TemplateForm;
