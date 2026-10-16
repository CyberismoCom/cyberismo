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
  Accordion,
  AccordionDetails,
  AccordionSummary,
  AspectRatio,
  Box,
  Card,
  CardOverflow,
  Grid,
  IconButton,
  Stack,
  SvgIcon,
  Tooltip,
  Typography,
} from '@mui/joy';
import { useTranslation } from 'react-i18next';

import AddLink from '@mui/icons-material/AddLink';
import Delete from '@mui/icons-material/Delete';
import ExpandMore from '@mui/icons-material/ExpandMore';
import Download from '@mui/icons-material/Download';
import InsertDriveFile from '@mui/icons-material/InsertDriveFile';

import { useAttachments } from '@/lib/api/attachments';
import { projectApiPaths } from '@/lib/swr';
import { UserRole, useHasMinRole } from '@/lib/auth';
import { LeadingSlot } from '@/components/CountBadge';
import { SidebarPanelAccordion } from './SidebarPanelAccordion';
import { AddAttachmentModal } from '@/components/modals';
import type { CardAttachment } from '@cyberismo/model';

const ADD_ATTACHMENT_PATH =
  'M640-520v-200h80v200h-80ZM440-244q-35-10-57.5-39T360-350v-370h80v476Zm30 164q-104 0-177-73t-73-177v-370q0-75 52.5-127.5T400-880q75 0 127.5 52.5T580-700v300h-80v-300q-1-42-29.5-71T400-800q-42 0-71 29t-29 71v370q-1 71 49 120.5T470-160q25 0 47.5-6.5T560-186v89q-21 8-43.5 12.5T470-80Zm170-40v-120H520v-80h120v-120h80v120h120v80H720v120h-80Z';

function AttachmentPreviewCard({
  name,
  children,
  cardKey,
  canDelete,
  onInsert,
}: {
  name: string;
  children?: React.ReactNode;
  cardKey: string;
  canDelete: boolean;
  onInsert?: () => void;
}) {
  const { removeAttachment } = useAttachments(cardKey);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const { t } = useTranslation();
  const apiPaths = projectApiPaths();

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
          {canDelete && (
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
          )}
          <Tooltip title={t('saveCopy')}>
            <IconButton
              component="a"
              variant="solid"
              color="primary"
              sx={{ marginRight: '3px' }}
              href={apiPaths.attachment(cardKey, name)}
              download
            >
              <Download />
            </IconButton>
          </Tooltip>
          {onInsert && (
            <Tooltip title={t('insertToContent')}>
              <IconButton
                data-cy="insertToContentButton"
                variant="solid"
                color="primary"
                sx={{ marginRight: '2px' }}
                onClick={() => onInsert()}
              >
                <AddLink />
              </IconButton>
            </Tooltip>
          )}
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
  /** Offered only while a content editor is open. */
  onInsert?: (attachment: CardAttachment) => void;
  initialExpanded?: boolean;
  /** `sidebar` matches the borderless sections beside it; `inline` is the narrow-screen accordion. */
  variant: 'sidebar' | 'inline';
};

export const AttachmentPanel: React.FC<AttachmentPanelProps> = ({
  cardKey,
  attachments,
  onInsert,
  initialExpanded = false,
  variant,
}) => {
  const { t } = useTranslation();
  const [modalOpen, setModalOpen] = useState(false);
  const [expanded, setExpanded] = useState(initialExpanded);
  const canEdit = useHasMinRole(UserRole.Editor);
  const apiPaths = projectApiPaths();

  if (attachments.length === 0 && !canEdit) return null;

  const badge = (
    <LeadingSlot>
      <Typography
        data-cy="attachmentCountBadge"
        level="body-xs"
        sx={{ color: 'inherit', lineHeight: 1 }}
      >
        {attachments.length}
      </Typography>
    </LeadingSlot>
  );

  const content = (
    <Stack spacing={1}>
      {canEdit && (
        <Tooltip title={t('addAttachment')}>
          <IconButton
            data-cy="addAttachmentButton"
            sx={{ alignSelf: 'flex-start' }}
            onClick={() => setModalOpen(true)}
          >
            <SvgIcon viewBox="0 -960 960 960" aria-label="Add attachment">
              <path d={ADD_ATTACHMENT_PATH} />
            </SvgIcon>
          </IconButton>
        </Tooltip>
      )}
      <Grid container gap={1.5}>
        {attachments.map((attachment) => (
          <Grid
            key={attachment.fileName}
            display="flex"
            justifyContent="center"
            width={120}
            draggable={!!onInsert}
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
              canDelete={canEdit}
              onInsert={onInsert && (() => onInsert(attachment))}
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
  );

  return (
    <>
      {variant === 'sidebar' ? (
        <Box sx={{ marginTop: 2 }} data-cy="cardAttachmentsPanel">
          <Accordion expanded={expanded}>
            <AccordionSummary
              indicator={<ExpandMore />}
              onClick={() => setExpanded(!expanded)}
              sx={{ borderRadius: '4px', marginTop: 1, marginBottom: 1 }}
            >
              {badge}
              <Typography
                level="title-sm"
                fontWeight="bold"
                sx={{ flexGrow: 1 }}
              >
                {t('attachments')}
              </Typography>
            </AccordionSummary>
            <AccordionDetails>{content}</AccordionDetails>
          </Accordion>
        </Box>
      ) : (
        <SidebarPanelAccordion
          expanded={expanded}
          onToggle={() => setExpanded(!expanded)}
          leading={badge}
          title={t('attachments')}
          dataCy="cardAttachmentsPanel"
        >
          {content}
        </SidebarPanelAccordion>
      )}
      {canEdit && (
        <AddAttachmentModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          cardKey={cardKey}
        />
      )}
    </>
  );
};
