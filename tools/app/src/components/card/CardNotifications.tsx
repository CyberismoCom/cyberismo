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
import type { Notification } from '@cyberismo/data-handler/types/queries';

export const CardNotifications = ({
  notifications,
}: {
  notifications: Notification[];
}) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(true);

  if (notifications.length === 0) {
    return null;
  }

  return (
    <Box sx={{ marginTop: 2, maxWidth: 400 }}>
      {notifications.length > 0 && (
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
            <Typography
              level="body-xs"
              color="primary"
              variant="soft"
              width={24}
              height={24}
              alignContent="center"
              borderRadius={40}
              marginLeft={0}
              paddingX={1.1}
            >
              {notifications.length}
            </Typography>
            <Typography
              level="title-sm"
              fontWeight="bold"
              sx={{ width: '100%' }}
            >
              {t('notifications')}
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
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
                    <Typography fontSize="xs">
                      {notification.message}
                    </Typography>
                  </Box>
                </Alert>
              ))}
            </Stack>
          </AccordionDetails>
        </Accordion>
      )}
    </Box>
  );
};
