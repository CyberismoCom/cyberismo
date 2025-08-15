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
import React, { useEffect } from 'react';
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
import { useTranslation } from 'react-i18next';
import Warning from '@mui/icons-material/Warning';

export interface BaseDeleteModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  content: React.ReactNode;
  confirmText: string;
  onDelete: () => Promise<void>;
  disabled: boolean;
  warning?: string;
  confirmButtonProps?: Record<string, unknown>;
}

export function BaseDeleteModal({
  open,
  onClose,
  title,
  content,
  confirmText,
  onDelete,
  disabled,
  warning,
  confirmButtonProps,
}: BaseDeleteModalProps) {
  const { t } = useTranslation();
  const [checked, setChecked] = React.useState(false);

  useEffect(() => {
    setChecked(false);
  }, [open]);

  const isButtonDisabled = Boolean(disabled || (warning && !checked));

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog>
        <DialogTitle>{title}</DialogTitle>
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
                disabled={disabled}
              />
            </Alert>
          )}
          <DialogActions>
            <Button
              {...confirmButtonProps}
              onClick={onDelete}
              color="danger"
              loading={disabled}
              disabled={isButtonDisabled}
            >
              {confirmText}
            </Button>
            <Button
              onClick={onClose}
              variant="plain"
              color="neutral"
              disabled={disabled}
            >
              {t('cancel')}
            </Button>
          </DialogActions>
        </DialogContent>
      </ModalDialog>
    </Modal>
  );
}
