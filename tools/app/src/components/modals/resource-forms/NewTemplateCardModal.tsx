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
import { BaseResourceModal } from './BaseResourceModal';
import {
  TemplateCardForm,
  type CreateTemplateCardData,
} from './TemplateCardForm';
import { createTemplateCard } from '@/lib/api/templates';
import { useProject } from '@/lib/api/project';

interface NewTemplateCardModalProps {
  open: boolean;
  onClose: () => void;
  templateResource: string;
  parentCardKey?: string;
}

export function NewTemplateCardModal({
  open,
  onClose,
  templateResource,
  parentCardKey,
}: NewTemplateCardModalProps) {
  const { t } = useTranslation();
  const { project } = useProject();

  const handleCreate = async (data: CreateTemplateCardData) => {
    const createdCards = await createTemplateCard(
      templateResource,
      data.cardType,
      parentCardKey,
    );
    if (createdCards.length && project?.prefix) {
      return `${project.prefix}/cards/${createdCards[0]}`;
    }
    return templateResource;
  };

  return (
    <BaseResourceModal
      open={open}
      onClose={onClose}
      title={t('templateCard')}
      createFn={handleCreate}
      FormComponent={TemplateCardForm}
    />
  );
}

export default NewTemplateCardModal;
