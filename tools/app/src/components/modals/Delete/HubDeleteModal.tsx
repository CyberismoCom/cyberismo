/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

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
