/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import React, { useCallback, useEffect, useMemo } from 'react';
import {
  Checkbox,
  Modal,
  ModalDialog,
  Typography,
  DialogTitle,
  DialogContent,
  Divider,
  DialogActions,
  Button,
  Alert,
} from '@mui/joy';
import { Trans, useTranslation } from 'react-i18next';
import { Warning } from '@mui/icons-material';
import { useCard } from '../../lib/api';
import { useAppDispatch, useChildAmount, useParentCard } from '@/app/lib/hooks';
import { useRouter } from 'next/navigation';
import { addNotification } from '@/app/lib/slices/notifications';

export interface DeleteModalProps {
  open: boolean;
  onClose: () => void;
  cardKey: string;
}

export function DeleteModal({ open, onClose, cardKey }: DeleteModalProps) {
  const { t } = useTranslation();
  const [checked, setChecked] = React.useState(false);

  const { deleteCard } = useCard(cardKey);
  const childAmount = useChildAmount(cardKey);

  const dispatch = useAppDispatch();

  const parent = useParentCard(cardKey);

  const router = useRouter();

  const warning = useMemo(
    () =>
      childAmount > 1
        ? t('deleteCardModal.warning', { cardAmount: childAmount })
        : undefined,
    [childAmount, t],
  );

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

  const handleDelete = useCallback(async () => {
    try {
      await deleteCard();
      dispatch(
        addNotification({
          message: t('deleteCardModal.success', { card: cardKey }),
          type: 'success',
        }),
      );
      onClose();
      if (parent) {
        router.push(`/cards/${parent.key}`);
      } else {
        router.push('/cards');
      }
    } catch (error) {
      dispatch(
        addNotification({
          message: error instanceof Error ? error.message : '',
          type: 'error',
        }),
      );
    }
  }, [onClose, cardKey, t, parent, router, deleteCard, dispatch]);

  // Reset checkbox state when dialog is closed/opened
  useEffect(() => {
    setChecked(false);
  }, [open]);

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog>
        <DialogTitle>{t('deleteCardModal.title')}</DialogTitle>
        <Divider />
        <DialogContent>
          <Typography level="body-md">{content}</Typography>
          {warning && (
            <Alert variant="soft" color="danger" endDecorator={<Warning />}>
              <Checkbox
                label={
                  <Typography color="danger" variant="soft" fontWeight="normal">
                    {warning}
                  </Typography>
                }
                variant="outlined"
                checked={checked}
                onChange={(e) => setChecked(e.target.checked)}
              />
            </Alert>
          )}
          <DialogActions>
            <Button
              onClick={handleDelete}
              color="danger"
              disabled={warning != null && !checked}
            >
              {t('delete')}
            </Button>
            <Button onClick={onClose} variant="plain" color="neutral">
              {t('cancel')}
            </Button>
          </DialogActions>
        </DialogContent>
      </ModalDialog>
    </Modal>
  );
}

export default DeleteModal;
