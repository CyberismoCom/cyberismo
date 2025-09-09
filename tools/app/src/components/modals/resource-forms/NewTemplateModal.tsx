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
import { createTemplate, useProject } from '@/lib/api';
import { BaseResourceModal } from './BaseResourceModal';
import { TemplateForm } from './TemplateForm';
import type { CreateTemplateData } from '@/lib/definitions';

interface NewTemplateModalProps {
  open: boolean;
  onClose: () => void;
}

export function NewTemplateModal({ open, onClose }: NewTemplateModalProps) {
  const { t } = useTranslation();
  const { project } = useProject();

  const handleCreate = async (data: CreateTemplateData) => {
    await createTemplate(data);
    return `${project?.prefix}/templates/${data.identifier}`;
  };

  return (
    <BaseResourceModal
      open={open}
      onClose={onClose}
      title={t('newResourceModal.templates.name')}
      createFn={handleCreate}
      FormComponent={TemplateForm}
    />
  );
}

export default NewTemplateModal;
