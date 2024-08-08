/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import React from 'react';
import {
  Modal,
  ModalDialog,
  Typography,
  DialogTitle,
  DialogContent,
  Divider,
  DialogActions,
  Button,
} from '@mui/joy';
import { useTranslation } from 'react-i18next';

export interface GenericConfirmModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  content: string;
  confirmText: string;
  confirmColor?: 'primary' | 'danger';
  onConfirm: () => void;
}

export function GenericConfirmModal({
  open,
  onClose,
  title,
  content,
  confirmText,
  confirmColor = 'danger',
  onConfirm,
}: GenericConfirmModalProps) {
  const { t } = useTranslation();

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog>
        <DialogTitle>{title}</DialogTitle>
        <Divider />
        <DialogContent>
          <Typography level="body-md">{content}</Typography>
          <DialogActions>
            <Button onClick={onConfirm} color={confirmColor}>
              {confirmText}
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

export default GenericConfirmModal;
