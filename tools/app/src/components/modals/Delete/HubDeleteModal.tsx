// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { useMemo } from 'react';
import { Typography } from '@mui/joy';
import { Trans, useTranslation } from 'react-i18next';
import { BaseDeleteModal } from './BaseDeleteModal';

export interface HubDeleteModalProps {
  open: boolean;
  onClose: () => void;
  hubName: string;
  onDelete: () => Promise<void>;
  isDeleting: boolean;
}

export function HubDeleteModal({
  open,
  onClose,
  hubName,
  onDelete,
  isDeleting,
}: HubDeleteModalProps) {
  const { t } = useTranslation();

  const content = useMemo(
    () => (
      <Trans
        i18nKey="deleteHubModal.content"
        values={{
          hubName,
        }}
        components={{
          bold: <Typography fontWeight="bold" />,
        }}
      />
    ),
    [hubName],
  );

  return (
    <BaseDeleteModal
      open={open}
      onClose={onClose}
      title={t('deleteHubModal.title')}
      content={content}
      confirmText={t('delete')}
      onDelete={onDelete}
      disabled={isDeleting}
      confirmButtonProps={{ 'data-cy': 'confirmDeleteHubButton' }}
    />
  );
}

export default HubDeleteModal;
