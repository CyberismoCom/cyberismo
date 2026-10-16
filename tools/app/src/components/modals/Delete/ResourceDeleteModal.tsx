// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { Trans, useTranslation } from 'react-i18next';
import { BaseDeleteModal } from './BaseDeleteModal';
import { useMemo, useState } from 'react';
import { Typography } from '@mui/joy';
import { useResource } from '@/lib/api/resources';
import { useAppDispatch, useAppRouter } from '@/lib/hooks';
import { addNotification } from '@/lib/slices/notifications';
import { useCleanPrompt } from '@/components/config-editors/useCleanPrompt';

export interface ResourceDeleteModalProps {
  open: boolean;
  onClose: () => void;
  resourceName: string;
  resourceType: string;
}

export function ResourceDeleteModal({
  open,
  onClose,
  resourceName,
  resourceType,
}: ResourceDeleteModalProps) {
  const { t } = useTranslation();
  const { deleteResource } = useResource(resourceName);
  const dispatch = useAppDispatch();
  const [isDeleting, setIsDeleting] = useState(false);
  const router = useAppRouter();
  const { maybePromptClean } = useCleanPrompt();

  const content = useMemo(
    () => (
      <Trans
        i18nKey="deleteResourceModal.content"
        values={{
          resourceName,
        }}
        components={{
          bold: <Typography fontWeight="bold" />,
        }}
      />
    ),
    [resourceName],
  );
  return (
    <BaseDeleteModal
      open={open}
      onClose={onClose}
      disabled={isDeleting}
      title={t('deleteResourceModal.title', { resourceType })}
      content={content}
      confirmText={t('delete')}
      onDelete={async () => {
        try {
          setIsDeleting(true);
          await deleteResource();
          dispatch(
            addNotification({
              message: t('deleteResourceModal.success', { resourceName }),
              type: 'success',
            }),
          );
          // Card types stop declaring a deleted field type, so the values its
          // cards stored are left dormant.
          if (resourceType === 'fieldTypes') {
            await maybePromptClean();
          }
          onClose();
          router.push('/configuration');
        } catch (error) {
          dispatch(
            addNotification({
              message: error instanceof Error ? error.message : 'Unknown error',
              type: 'error',
            }),
          );
        } finally {
          setIsDeleting(false);
        }
      }}
      confirmButtonProps={{ 'data-cy': 'confirmDeleteResourceButton' }}
    />
  );
}
