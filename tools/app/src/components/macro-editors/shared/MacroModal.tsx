// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { useTranslation } from 'react-i18next';
import {
  Button,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Modal,
  ModalDialog,
  Stack,
} from '@mui/joy';
import type { ReactNode } from 'react';

export interface BaseMacroModalProps {
  /**
   * The actual macro form implement as children component
   */
  children: ReactNode;
  /**
   * Whether the modal is open or not
   */
  open: boolean;
  /**
   * Allows overriding spacing between macros
   */
  rowSpacing?: number;
  /**
   * Disables submit button
   */
  submitDisabled?: boolean;
  /**
   * Title of the modal
   */
  title: string;
  /**
   * Called my modal if to request closing the modal
   * @returns
   */
  onClose: () => void;
  /**
   * Called when modal is submitted
   */
  onSubmit: () => void;
}

export function BaseMacroModal({
  children,
  open,
  rowSpacing = 2,
  submitDisabled = false,
  title,
  onClose,
  onSubmit,
}: BaseMacroModalProps) {
  const { t } = useTranslation();

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog>
        <DialogTitle>{title}</DialogTitle>
        <Divider />
        <DialogContent
          sx={{
            p: 1,
          }}
        >
          <Stack spacing={rowSpacing}>{children}</Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onSubmit} disabled={submitDisabled}>
            {t('asciiDocEditor.macros.insert')}
          </Button>
          <Button variant="plain" onClick={onClose}>
            {t('cancel')}
          </Button>
        </DialogActions>
      </ModalDialog>
    </Modal>
  );
}

export default BaseMacroModal;
