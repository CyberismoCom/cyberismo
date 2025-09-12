/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2025
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
