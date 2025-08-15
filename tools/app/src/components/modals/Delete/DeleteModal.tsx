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

import { useCard } from '../../../lib/api';
import { useChildAmount, useParentCard, useAppRouter } from '@/lib/hooks';
import { useMemo } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Typography } from '@mui/joy';
import { BaseDeleteModal } from './BaseDeleteModal';

export interface DeleteModalProps {
  open: boolean;
  onClose: () => void;
  cardKey: string;
}

export function DeleteModal({ open, onClose, cardKey }: DeleteModalProps) {
  const { t } = useTranslation();
  const { deleteCard, isUpdating } = useCard(cardKey);
  const childAmount = useChildAmount(cardKey);
  const parent = useParentCard(cardKey);
  const router = useAppRouter();

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
      if (parent) {
        router.push(`/cards/${parent.key}`);
      } else {
        router.push('/cards');
      }
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
