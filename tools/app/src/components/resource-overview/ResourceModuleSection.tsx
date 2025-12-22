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

import { Button, Stack, Typography } from '@mui/joy';
import AddRounded from '@mui/icons-material/AddRounded';
import ExpandLessRounded from '@mui/icons-material/ExpandLessRounded';
import { useTranslation } from 'react-i18next';

export function ResourceModuleSection({
  title,
  children,
  showViewMore,
  expanded,
  onToggleExpanded,
}: {
  title: string;
  children: React.ReactNode;
  showViewMore?: boolean;
  expanded?: boolean;
  onToggleExpanded?: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Stack spacing={1.5}>
      <Typography level="h3" sx={{ mt: 2 }}>
        {title}
      </Typography>
      {children}
      {showViewMore && onToggleExpanded && (
        <Button
          fullWidth
          size="sm"
          variant="outlined"
          startDecorator={expanded ? <ExpandLessRounded /> : <AddRounded />}
          onClick={onToggleExpanded}
        >
          {expanded ? t('showLess') : t('overview.viewMore')}
        </Button>
      )}
    </Stack>
  );
}
