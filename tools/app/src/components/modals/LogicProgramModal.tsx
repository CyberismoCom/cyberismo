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
  const { logicPrograms, error } = useLogicPrograms(resourceName);

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog size="lg" sx={{ maxWidth: '80vw', maxHeight: '80vh' }}>
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
