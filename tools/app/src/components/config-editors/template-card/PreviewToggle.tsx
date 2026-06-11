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
