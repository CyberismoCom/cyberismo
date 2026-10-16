// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { useTranslation } from 'react-i18next';
import type { ResourceFormProps } from './BaseResourceModal';
import type { CreateLinkTypeData } from '@/lib/definitions';
import BaseCreateForm from './BaseCreateForm';
import IdentifierField from './IdentifierField';

export function LinkTypeForm({
  onSubmit,
  isSubmitting,
}: ResourceFormProps<CreateLinkTypeData>) {
  const { t } = useTranslation();
  return (
    <BaseCreateForm
      defaultValues={{ identifier: '' }}
      onSubmit={onSubmit}
      isSubmitting={isSubmitting}
      resourceTypeLabel={t('newResourceModal.linkTypes.name')}
    >
      {({ control }) => <IdentifierField control={control} type="linkTypes" />}
    </BaseCreateForm>
  );
}

export default LinkTypeForm;
