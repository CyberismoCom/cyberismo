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

import { useMemo } from 'react';
import { Typography } from '@mui/joy';
import { Trans, useTranslation } from 'react-i18next';
import { BaseDeleteModal } from './BaseDeleteModal';

export interface ModuleDeleteModalProps {
  open: boolean;
  onClose: () => void;
  moduleName: string;
  cardKeyPrefix: string;
  onDelete: () => Promise<void>;
  isDeleting: boolean;
}

export function ModuleDeleteModal({
  open,
  onClose,
  moduleName,
  cardKeyPrefix,
  onDelete,
  isDeleting,
}: ModuleDeleteModalProps) {
  const { t } = useTranslation();

  const content = useMemo(
    () => (
      <Trans
        i18nKey="deleteModuleModal.content"
        values={{
          moduleName,
        }}
        components={{
          bold: <Typography fontWeight="bold" />,
        }}
      />
    ),
    [moduleName],
  );

  const warning = useMemo(
    () =>
      t('deleteModuleModal.warning', {
        moduleName,
        cardKeyPrefix,
      }),
    [cardKeyPrefix, moduleName, t],
  );

  return (
    <BaseDeleteModal
      open={open}
      onClose={onClose}
      title={t('deleteModuleModal.title')}
      content={content}
      confirmText={t('delete')}
      onDelete={onDelete}
      disabled={isDeleting}
      warning={warning}
      confirmButtonProps={{ 'data-cy': 'confirmDeleteModuleButton' }}
    />
  );
}

export default ModuleDeleteModal;
