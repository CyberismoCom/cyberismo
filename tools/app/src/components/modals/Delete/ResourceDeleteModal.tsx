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
