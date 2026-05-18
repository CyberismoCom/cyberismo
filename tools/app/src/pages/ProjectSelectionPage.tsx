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
