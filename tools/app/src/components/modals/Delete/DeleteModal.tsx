// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { useCard } from '../../../lib/api';
import { useChildAmount } from '@/lib/hooks';
import { useMemo } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Typography } from '@mui/joy';
import { BaseDeleteModal } from './BaseDeleteModal';

export interface DeleteModalProps {
  open: boolean;
  onClose: () => void;
  cardKey: string;
  afterDelete?: () => void;
}

export function DeleteModal({
  open,
  onClose,
  cardKey,
  afterDelete,
}: DeleteModalProps) {
  const { t } = useTranslation();
  const { deleteCard, isUpdating } = useCard(cardKey);
  const childAmount = useChildAmount(cardKey);

  const warning = useMemo((): string | undefined => {
    if (childAmount > 1) {
      return t('deleteCardModal.warning', { cardAmount: childAmount });
    }
    return undefined;
  }, [childAmount, t]);

  const content = useMemo(
    () => (
      <Trans
        i18nKey="deleteCardModal.content"
        values={{
          card: cardKey,
        }}
        count={childAmount}
        components={{
          bold: <Typography fontWeight="bold" />,
        }}
      />
    ),
    [cardKey, childAmount],
  );

  const handleDelete = async () => {
    const result = await deleteCard();
    if (result) {
      onClose();
      afterDelete?.();
    }
  };

  return (
    <BaseDeleteModal
      open={open}
      onClose={onClose}
      title={t('deleteCardModal.title')}
      content={content}
      confirmText={t('delete')}
      onDelete={handleDelete}
      disabled={isUpdating('delete') || isUpdating()}
      warning={warning}
      confirmButtonProps={{ 'data-cy': 'confirmDeleteButton' }}
    />
  );
}

export default DeleteModal;
