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
} from '@mui/joy';
import type { ReactNode } from 'react';

export interface MacroModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  onSubmit: () => void;
  submitDisabled?: boolean;
  children: ReactNode;
}

export function MacroModal({
  open,
  title,
  onClose,
  onSubmit,
  submitDisabled = false,
  children,
}: MacroModalProps) {
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
          {children}
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

export default MacroModal;
