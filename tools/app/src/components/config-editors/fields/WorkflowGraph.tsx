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
import {
  Box,
  CircularProgress,
  IconButton,
  Tooltip,
  Typography,
} from '@mui/joy';
import Fullscreen from '@mui/icons-material/Fullscreen';
import { useTranslation } from 'react-i18next';
import { useWorkflowGraph } from '@/lib/api';
import SvgViewerModal from '@/components/modals/svgViewerModal';

export function WorkflowGraph({ workflowName }: { workflowName: string }) {
  const { t } = useTranslation();
  const { workflowGraph, isLoading, error } = useWorkflowGraph(workflowName);
  const [modalOpen, setModalOpen] = useState(false);

  const svgMarkup = workflowGraph?.svg ? atob(workflowGraph.svg) : '';

  const body = isLoading ? (
    <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
      <CircularProgress size="sm" />
    </Box>
  ) : error || !workflowGraph?.svg ? (
    <Typography level="body-sm" color="danger">
      {t('workflowGraph.error')}
    </Typography>
  ) : (
    <Box
      sx={{
        position: 'relative',
        display: 'flex',
        justifyContent: 'center',
        py: 2,
      }}
    >
      <img
        src={`data:image/svg+xml;base64,${workflowGraph.svg}`}
        alt={t('workflowGraph.alt')}
        style={{
          maxWidth: '100%',
          maxHeight: '500px',
          width: 'auto',
          height: 'auto',
          display: 'block',
        }}
      />
      <Tooltip title={t('workflowGraph.viewTooltip')} placement="top">
        <IconButton
          size="sm"
          variant="soft"
          color="neutral"
          onClick={() => setModalOpen(true)}
          sx={{ position: 'absolute', top: 8, right: 8 }}
          aria-label={t('workflowGraph.viewTooltip')}
        >
          <Fullscreen />
        </IconButton>
      </Tooltip>
    </Box>
  );

  return (
    <Box>
      <Typography level="h4" marginTop={6} marginBottom={4}>
        {t('workflowGraph.title')}
      </Typography>
      {body}
      <SvgViewerModal
        open={modalOpen && Boolean(svgMarkup)}
        svgMarkup={svgMarkup}
        onClose={() => setModalOpen(false)}
      />
    </Box>
  );
}

export default WorkflowGraph;
