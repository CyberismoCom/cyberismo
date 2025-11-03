/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2025

  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

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
