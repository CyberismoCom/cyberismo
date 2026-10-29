// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import {
  Modal,
  ModalDialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  ModalClose,
  Typography,
  Box,
} from '@mui/joy';
import { useTranslation } from 'react-i18next';
import { useLogicPrograms } from '@/lib/api/logicPrograms';

interface LogicProgramModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  resourceName: string;
}

export function LogicProgramModal({
  open,
  onClose,
  title,
  resourceName,
}: LogicProgramModalProps) {
  const { t } = useTranslation();
  // Conditional ensures logic program is refetched after the modal is opened
  const { logicPrograms, error } = useLogicPrograms(open ? resourceName : null);

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog
        size="lg"
        sx={{
          width: { xs: '95vw', sm: 'auto' },
          maxWidth: '80vw',
          maxHeight: '80vh',
        }}
      >
        <ModalClose />
        <DialogTitle>{title}</DialogTitle>
        <DialogContent>
          <Box
            sx={{
              backgroundColor: 'background.level1',
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: '4px',
              padding: 2,
              whiteSpace: 'pre-wrap',
              overflow: 'auto',
              maxHeight: '60vh',
            }}
          >
            {error && (
              <Typography component="pre" level="body-sm">
                {error.message}
              </Typography>
            )}
            <Typography component="pre" level="body-sm">
              {logicPrograms?.logicProgram}
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} variant="plain" color="neutral">
            {t('close')}
          </Button>
        </DialogActions>
      </ModalDialog>
    </Modal>
  );
}

export default LogicProgramModal;
