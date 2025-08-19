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
import { createGraphModel, useProject } from '@/lib/api';
import { BaseResourceModal } from './BaseResourceModal';
import { GraphModelForm } from './GraphModelForm';
import { CreateGraphModelData } from '@/lib/definitions';

interface NewGraphModelModalProps {
  open: boolean;
  onClose: () => void;
}

export function NewGraphModelModal({ open, onClose }: NewGraphModelModalProps) {
  const { t } = useTranslation();
  const { project } = useProject();

  const handleCreate = async (data: CreateGraphModelData) => {
    await createGraphModel(data);
    return `${project?.prefix}/graphModels/${data.identifier}`;
  };

  return (
    <BaseResourceModal
      open={open}
      onClose={onClose}
      title={t('newResourceModal.graphModels.name')}
      createFn={handleCreate}
      FormComponent={GraphModelForm}
    />
  );
}

export default NewGraphModelModal;
