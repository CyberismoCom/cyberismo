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
import Warning from '@mui/icons-material/Warning';
import { useCard } from '../../lib/api';
import { useChildAmount, useParentCard, useAppRouter } from '@/lib/hooks';

export interface DeleteModalProps {
  open: boolean;
  onClose: () => void;
  cardKey: string;
}

export function DeleteModal({ open, onClose, cardKey }: DeleteModalProps) {
  const { t } = useTranslation();
  const [checked, setChecked] = React.useState(false);

  const { deleteCard, isUpdating } = useCard(cardKey);
  const childAmount = useChildAmount(cardKey);
  const parent = useParentCard(cardKey);
  const router = useAppRouter();

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
    const success = await deleteCard();
    if (success) {
      onClose();
      if (parent) {
        router.push(`/cards/${parent.key}`);
      } else {
        router.push('/cards');
      }
    }
  }, [onClose, parent, router, deleteCard]);

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
                disabled={isUpdating('delete')}
              />
            </Alert>
          )}
          <DialogActions>
            <Button
              data-cy="confirmDeleteButton"
              onClick={handleDelete}
              color="danger"
              loading={isUpdating('delete')}
              disabled={(warning != null && !checked) || isUpdating()}
            >
              {t('delete')}
            </Button>
            <Button
              onClick={onClose}
              variant="plain"
              color="neutral"
              disabled={isUpdating()}
            >
              {t('cancel')}
            </Button>
          </DialogActions>
        </DialogContent>
      </ModalDialog>
    </Modal>
  );
}

export default DeleteModal;
