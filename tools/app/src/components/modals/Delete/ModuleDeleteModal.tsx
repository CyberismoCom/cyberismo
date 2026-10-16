// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

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
