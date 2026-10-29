// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

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
  content: React.ReactNode;
  confirmText: string;
  confirmColor?: 'primary' | 'danger';
  confirmDisabled?: boolean;
  onConfirm: () => void;
}

export function GenericConfirmModal({
  open,
  onClose,
  title,
  content,
  confirmText,
  confirmColor = 'danger',
  confirmDisabled = false,
  onConfirm,
}: GenericConfirmModalProps) {
  const { t } = useTranslation();

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog>
        <DialogTitle>{title}</DialogTitle>
        <Divider />
        <DialogContent>
          {typeof content === 'string' ? (
            <Typography level="body-md">{content}</Typography>
          ) : (
            content
          )}
          <DialogActions>
            <Button
              onClick={onConfirm}
              color={confirmColor}
              disabled={confirmDisabled}
            >
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
