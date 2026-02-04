/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

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
