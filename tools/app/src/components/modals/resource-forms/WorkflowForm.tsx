// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { useTranslation } from 'react-i18next';
import type { ResourceFormProps } from './BaseResourceModal';
import type { CreateWorkflowData } from '@/lib/definitions';
import BaseCreateForm from './BaseCreateForm';
import IdentifierField from './IdentifierField';

export function WorkflowForm({
  onSubmit,
  isSubmitting,
}: ResourceFormProps<CreateWorkflowData>) {
  const { t } = useTranslation();
  return (
    <BaseCreateForm
      defaultValues={{ identifier: '' }}
      onSubmit={onSubmit}
      isSubmitting={isSubmitting}
      resourceTypeLabel={t('newResourceModal.workflows.name')}
    >
      {({ control }) => <IdentifierField control={control} type="workflows" />}
    </BaseCreateForm>
  );
}

export default WorkflowForm;
