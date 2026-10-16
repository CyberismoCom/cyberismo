// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Stack,
  Typography,
} from '@mui/joy';
import { useTranslation } from 'react-i18next';
import ExpandMore from '@mui/icons-material/ExpandMore';
import type { Notification } from '@cyberismo/model';
import { CountBadge } from '@/components/CountBadge';

export const CardNotifications = ({
  notifications,
  collapsible = true,
}: {
  notifications: Notification[];
  collapsible?: boolean;
}) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(true);

  if (notifications.length === 0) {
    return null;
  }

  const badge = <CountBadge count={notifications.length} />;

  const title = (
    <Typography
      level={collapsible ? 'title-sm' : 'body-xs'}
      fontWeight={collapsible ? 'bold' : 'lg'}
      sx={{ flexGrow: 1 }}
    >
      {t('notifications')}
    </Typography>
  );

  const items = (
    <Stack spacing={1}>
      {notifications.map((notification, index) => (
        <Alert
          key={index}
          color="primary"
          variant="soft"
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Box>
            <Typography level="title-sm" fontWeight="bold">
              {notification.category} - {notification.title}
            </Typography>
            <Typography fontSize="xs">{notification.message}</Typography>
          </Box>
        </Alert>
      ))}
    </Stack>
  );

  if (!collapsible) {
    return (
      <Stack spacing={1}>
        <Stack direction="row" alignItems="center" spacing={2}>
          {badge}
          {title}
        </Stack>
        {items}
      </Stack>
    );
  }

  return (
    <Box sx={{ marginTop: 2, maxWidth: 400 }}>
      <Accordion expanded={expanded}>
        <AccordionSummary
          indicator={<ExpandMore />}
          onClick={() => setExpanded(!expanded)}
          sx={{
            borderRadius: '4px',
            marginTop: 1,
            marginBottom: 1,
          }}
        >
          {badge}
          {title}
        </AccordionSummary>
        <AccordionDetails>{items}</AccordionDetails>
      </Accordion>
    </Box>
  );
};
