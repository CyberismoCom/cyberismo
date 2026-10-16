// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { Box, Button } from '@mui/joy';
import EditIcon from '@mui/icons-material/Edit';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { useTranslation } from 'react-i18next';

export function PreviewToggle({
  isPreview,
  onToggle,
}: {
  isPreview: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
      <Button
        data-cy={isPreview ? 'editTab' : 'previewTab'}
        size="sm"
        variant="outlined"
        color="primary"
        startDecorator={isPreview ? <EditIcon /> : <VisibilityIcon />}
        onClick={onToggle}
      >
        {isPreview ? t('edit') : t('preview')}
      </Button>
    </Box>
  );
}
