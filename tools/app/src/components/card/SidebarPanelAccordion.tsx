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

import type { ReactNode } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Typography,
} from '@mui/joy';
import ExpandMore from '@mui/icons-material/ExpandMore';
import { useTranslation } from 'react-i18next';

export function SidebarPanelAccordion({
  expanded,
  onToggle,
  leading,
  title,
  children,
  dataCy,
}: {
  expanded: boolean;
  onToggle: () => void;
  leading: ReactNode;
  title: string;
  children: ReactNode;
  dataCy?: string;
}) {
  const { t } = useTranslation();
  return (
    <Box
      border="1px solid"
      borderColor="neutral.outlinedBorder"
      borderRadius={6}
    >
      <Accordion expanded={expanded} data-cy={dataCy}>
        <AccordionSummary
          onClick={onToggle}
          sx={{ borderRadius: 6 }}
          slotProps={{
            button: {
              sx: {
                padding: { xs: 1, sm: 1.5 },
                gap: 2,
                borderRadius: 'inherit',
              },
            },
            indicator: { sx: { display: 'none' } },
          }}
        >
          {leading}
          <Typography level="title-sm" fontWeight="bold" sx={{ flexGrow: 1 }}>
            {title}
          </Typography>
          <Button
            component="span"
            variant="plain"
            color="primary"
            size="sm"
            endDecorator={
              <ExpandMore
                sx={{
                  transition: 'transform 0.2s',
                  transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                }}
              />
            }
            sx={(theme) => ({
              [theme.breakpoints.down('sm')]: {
                paddingBlock: 0,
                minHeight: 'auto',
              },
            })}
          >
            <Box
              component="span"
              sx={{ display: { xs: 'none', sm: 'inline' } }}
            >
              {expanded ? t('showLess') : t('showMore')}
            </Box>
          </Button>
        </AccordionSummary>
        <AccordionDetails>
          <Box
            sx={{
              paddingX: { xs: 1, sm: 1.5 },
              paddingBottom: { xs: 1, sm: 1.5 },
              paddingTop: 1,
            }}
          >
            {children}
          </Box>
        </AccordionDetails>
      </Accordion>
    </Box>
  );
}
