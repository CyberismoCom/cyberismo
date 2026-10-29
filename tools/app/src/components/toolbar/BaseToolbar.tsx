// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import React from 'react';
import { Box } from '@mui/joy';

interface BaseToolbarProps {
  breadcrumbs?: React.ReactNode;
  contextMenu?: React.ReactNode;
  actions?: React.ReactNode;
}

const BaseToolbar: React.FC<BaseToolbarProps> = ({
  breadcrumbs,
  contextMenu,
  actions,
}) => {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center' }} px={3} py={1}>
      <Box sx={{ flexGrow: 1 }}>{breadcrumbs}</Box>

      {contextMenu}

      {actions}
    </Box>
  );
};

export default BaseToolbar;
