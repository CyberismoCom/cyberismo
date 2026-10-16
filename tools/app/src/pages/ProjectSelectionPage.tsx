// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { useState } from 'react';
import { Box, Typography } from '@mui/joy';
import { useTranslation } from 'react-i18next';
import { ProjectSelectionModal } from '@/components/modals/ProjectSelectionModal';

export default function ProjectSelectionPage() {
  const { t } = useTranslation();
  const [open] = useState(true);

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        bgcolor: 'background.body',
      }}
    >
      <Typography level="h3" color="neutral">
        {t('projectDialog.selectProject')}
      </Typography>
      <ProjectSelectionModal
        open={open}
        onClose={() => {
          /* non-dismissable on this page */
        }}
        dismissable={false}
      />
    </Box>
  );
}
