// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

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
