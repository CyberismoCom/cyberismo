// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

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
