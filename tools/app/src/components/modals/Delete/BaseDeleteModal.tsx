// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import React from 'react';
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

  const isButtonDisabled = Boolean(disabled || (warning && !checked));

  return (
    <Modal
      open={open}
      onClose={() => {
        setChecked(false);
        onClose();
      }}
    >
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
