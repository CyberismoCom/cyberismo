/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026

  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import React, { useState } from 'react';
import {
  AspectRatio,
  Box,
  Card,
  CardOverflow,
  Grid,
  IconButton,
  Link,
  Stack,
  Tooltip,
  Typography,
} from '@mui/joy';
import { useTranslation } from 'react-i18next';

import AddLink from '@mui/icons-material/AddLink';
import Delete from '@mui/icons-material/Delete';
import Download from '@mui/icons-material/Download';
import Edit from '@mui/icons-material/Edit';
import InsertDriveFile from '@mui/icons-material/InsertDriveFile';

import { useAttachments } from '@/lib/api/attachments';
import { useAppDispatch } from '@/lib/hooks';
import { addNotification } from '@/lib/slices/notifications';
import { openAttachment } from '@/lib/api/actions';
import { apiPaths } from '@/lib/swr';
import { AddAttachmentModal } from '@/components/modals';
import type { CardAttachment } from '@cyberismo/data-handler/interfaces/project-interfaces';

function AttachmentPreviewCard({
  name,
  children,
  cardKey,
  onInsert,
}: {
  name: string;
  children?: React.ReactNode;
  cardKey: string;
  onInsert?: () => void;
}) {
  const { removeAttachment } = useAttachments(cardKey);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const dispatch = useAppDispatch();
  const { t } = useTranslation();

  return (
    <Card
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      sx={{
        width: '100%',
        gap: 0,
        overflow: 'hidden',
      }}
    >
      <CardOverflow>
        <Box
          position="absolute"
          top={isHovered ? 0 : -36}
          right={0}
          zIndex={1}
          sx={{ transition: 'top 0.3s' }}
        >
          <Tooltip title={t('delete')}>
            <IconButton
              color="danger"
              variant="solid"
              loading={isUpdating}
              sx={{ marginRight: '3px' }}
              onClick={async () => {
                const confirmed = confirm(t('confirmDeleteAttachment'));
                if (confirmed) {
                  setIsUpdating(true);
                  await removeAttachment(name);
                  setIsUpdating(false);
                }
              }}
            >
              <Delete />
            </IconButton>
          </Tooltip>
          <Tooltip title={t('saveCopy')}>
            <IconButton
              variant="solid"
              color="primary"
              sx={{ marginRight: '3px' }}
            >
              <Link
                endDecorator={<Download />}
                href={apiPaths.attachment(cardKey, name)}
                download
                variant="solid"
              />
            </IconButton>
          </Tooltip>
          <Tooltip title={t('openInEditor')}>
            <IconButton
              variant="solid"
              color="primary"
              sx={{ marginRight: '3px' }}
              onClick={async (e) => {
                e.stopPropagation();
                try {
                  await openAttachment(cardKey, name);
                } catch (error) {
                  dispatch(
                    addNotification({
                      message: error instanceof Error ? error.message : '',
                      type: 'error',
                    }),
                  );
                }
              }}
            >
              <Edit />
            </IconButton>
          </Tooltip>
          <Tooltip title={t('insertToContent')}>
            <IconButton
              data-cy="insertToContentButton"
              variant="solid"
              color="primary"
              sx={{ marginRight: '2px' }}
              onClick={() => onInsert?.()}
            >
              <AddLink />
            </IconButton>
          </Tooltip>
        </Box>
        <AspectRatio
          ratio="1"
          maxHeight={97}
          variant="plain"
          objectFit="contain"
        >
          {children}
        </AspectRatio>
      </CardOverflow>
      <Typography level="body-xs" noWrap textAlign="center" paddingY={0.5}>
        {name}
      </Typography>
    </Card>
  );
}

type AttachmentPanelProps = {
  cardKey: string;
  attachments: CardAttachment[];
  onInsert: (attachment: CardAttachment) => void;
};

export const AttachmentPanel: React.FC<AttachmentPanelProps> = ({
  cardKey,
  attachments,
  onInsert,
}) => {
  const { t } = useTranslation();
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <Stack spacing={1}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography
            level="body-xs"
            color="warning"
            variant="soft"
            width={24}
            height={24}
            alignContent="center"
            borderRadius={40}
            paddingX={1.1}
          >
            {attachments.length}
          </Typography>
          <Typography level="body-xs">
            {attachments.length === 1 ? t('attachment') : t('attachments')}
          </Typography>
          <Tooltip title={t('addAttachment')}>
            <IconButton
              data-cy="addAttachmentButton"
              onClick={() => setModalOpen(true)}
            >
              <img
                alt="Add attachment"
                width={24}
                height={24}
                src="/images/attach_file_add.svg"
              />
            </IconButton>
          </Tooltip>
        </Stack>
        <Grid container gap={1.5}>
          {attachments.map((attachment) => (
            <Grid
              key={attachment.fileName}
              display="flex"
              justifyContent="center"
              width={120}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'copy';
                e.dataTransfer.setData(
                  'text/uri-list',
                  apiPaths.attachment(cardKey, attachment.fileName),
                );
                const preview = e.currentTarget.querySelector<HTMLElement>(
                  '[data-attachment-preview]',
                );
                if (preview) {
                  const rect = preview.getBoundingClientRect();
                  e.dataTransfer.setDragImage(
                    preview,
                    rect.width / 2,
                    rect.height / 2,
                  );
                }
              }}
            >
              <AttachmentPreviewCard
                name={attachment.fileName}
                cardKey={cardKey}
                onInsert={() => onInsert(attachment)}
              >
                <Box
                  data-attachment-preview
                  sx={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {attachment.mimeType?.startsWith('image') ? (
                    <img
                      src={apiPaths.attachment(cardKey, attachment.fileName)}
                      alt=""
                      draggable={false}
                    />
                  ) : (
                    <InsertDriveFile />
                  )}
                </Box>
              </AttachmentPreviewCard>
            </Grid>
          ))}
        </Grid>
      </Stack>
      <AddAttachmentModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        cardKey={cardKey}
      />
    </>
  );
};
