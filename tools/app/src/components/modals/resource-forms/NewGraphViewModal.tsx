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
import { createGraphView, useProject } from '@/lib/api';
import { BaseResourceModal } from './BaseResourceModal';
import { GraphViewForm } from './GraphViewForm';
import { CreateGraphViewData } from '@/lib/definitions';

interface NewGraphViewModalProps {
  open: boolean;
  onClose: () => void;
}

export function NewGraphViewModal({ open, onClose }: NewGraphViewModalProps) {
  const { t } = useTranslation();
  const { project } = useProject();

  const handleCreate = async (data: CreateGraphViewData) => {
    await createGraphView(data);
    return `${project?.prefix}/graphViews/${data.identifier}`;
  };

  return (
    <BaseResourceModal
      open={open}
      onClose={onClose}
      title={t('newResourceModal.graphViews.name')}
      createFn={handleCreate}
      FormComponent={GraphViewForm}
      FormComponentProps={{}}
    />
  );
}

export default NewGraphViewModal;
