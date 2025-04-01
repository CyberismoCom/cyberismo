/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import React, { useEffect } from 'react';
import {
  Modal,
  ModalDialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  ModalClose,
  Stack,
  Typography,
  Box,
} from '@mui/joy';
import { useTranslation } from 'react-i18next';
import DnDFile from '../DnDFile';
import { useAttachments } from '@/lib/api/attachments';
import { useAppDispatch } from '@/lib/hooks';
import { addNotification } from '@/lib/slices/notifications';
import { useAppRouter } from '@/lib/hooks';

interface AddAttachmentModalProps {
  open: boolean;
  onClose: () => void;
  cardKey: string | null;
}

export function AddAttachmentModal({
  open,
  onClose,
  cardKey,
}: AddAttachmentModalProps) {
  const { t } = useTranslation();

  const [files, setFiles] = React.useState<File[]>([]);

  const { addAttachments, isUpdating } = useAttachments(cardKey);

  const dispatch = useAppDispatch();

  const router = useAppRouter();

  const addFiles = (newFiles: FileList) => {
    // find files that are not already in the list
    const newFilesArray = Array.from(newFiles);
    const filteredFiles = newFilesArray.filter(
      (newFile) => !files.find((file) => file.name === newFile.name),
    );
    setFiles([...files, ...filteredFiles]);
  };

  useEffect(() => {
    setFiles([]);
  }, [open]);

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog>
        <ModalClose />
        <DialogTitle>{t('addAttachmentModal.title')}</DialogTitle>
        <DialogContent>
          <DnDFile onDrop={(files) => addFiles(files)}>
            {({ isHovering }) => (
              <Stack
                padding={10}
                spacing={2}
                borderRadius={20}
                border={1}
                alignItems="center"
                borderColor="primary.outlinedBorder"
                sx={{
                  borderStyle: 'dashed',
                  backgroundColor: isHovering
                    ? 'primary.outlinedHoverBg'
                    : 'transparent',
                }}
              >
                <Typography>{t('addAttachmentModal.dragNdrop')}</Typography>
                <Typography>{t('or')}</Typography>
                <Button
                  data-cy="fileUploadButton"
                  variant="outlined"
                  component="label"
                >
                  {t('addAttachmentModal.browseFiles')}
                  <input
                    type="file"
                    onChange={(e) => {
                      if (e.target.files) addFiles(e.target.files);
                    }}
                    multiple
                    hidden
                  />
                </Button>
              </Stack>
            )}
          </DnDFile>
          <Box
            sx={{
              // make the box scrollable
              overflowY: 'scroll',
              scrollbarWidth: 'thin',
            }}
          >
            {files.map((file) => (
              <Box
                key={file.name}
                paddingY={2}
                marginY={1}
                paddingX={3}
                bgcolor="white"
              >
                <Typography level="title-sm">{file.name}</Typography>
              </Box>
            ))}
          </Box>
          <DialogActions>
            <Button
              data-cy="confirmAddAttachmentButton"
              disabled={files.length === 0 || isUpdating()}
              color="primary"
              onClick={async () => {
                try {
                  await addAttachments(files);
                  dispatch(
                    addNotification({
                      message: t('addAttachmentModal.success'),
                      type: 'success',
                    }),
                  );
                  onClose();
                  router.push(`/cards/${cardKey}/edit`);
                } catch (error) {
                  dispatch(
                    addNotification({
                      message: t('addAttachmentModal.error', {
                        error: error,
                      }),
                      type: 'error',
                    }),
                  );
                }
              }}
            >
              {t('add')}
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

export default AddAttachmentModal;
