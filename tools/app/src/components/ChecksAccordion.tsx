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

import { useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Link,
  Stack,
  Typography,
} from '@mui/joy';
import { useTranslation } from 'react-i18next';
import ExpandMore from '@mui/icons-material/ExpandMore';
import { config } from '@/lib/utils';
import { useAppRouter } from '../lib/hooks';

// Generic types for check items
export interface CheckItem {
  category: string;
  title: string;
}

export type SuccessCheckItem = CheckItem;

export interface FailureCheckItem extends CheckItem {
  errorMessage: string;
  fieldName?: string;
}

export interface CheckCollection {
  successes: SuccessCheckItem[];
  failures: FailureCheckItem[];
}

interface ChecksAccordionProps {
  checks: CheckCollection;
  cardKey: string;
  successTitle: string;
  failureTitle: string;
  successPassText: string;
  failureFailText: string;
  initialSuccessesExpanded?: boolean;
  initialFailuresExpanded?: boolean;
  goToFieldText?: string;
  showGoToField?: boolean;
}

export function ChecksAccordion({
  checks,
  cardKey,
  successTitle,
  failureTitle,
  successPassText,
  failureFailText,
  initialSuccessesExpanded = false,
  initialFailuresExpanded = true,
  goToFieldText,
  showGoToField = true,
}: ChecksAccordionProps) {
  const { t } = useTranslation();
  const [successesExpanded, setSuccessesExpanded] = useState(
    initialSuccessesExpanded,
  );
  const [failuresExpanded, setFailuresExpanded] = useState(
    initialFailuresExpanded,
  );
  const router = useAppRouter();

  if (checks.successes.length === 0 && checks.failures.length === 0) {
    return null;
  }

  const handleGoToField = (cardKey: string, fieldName: string) => {
    router.push(`/cards/${cardKey}/edit?focusField=${fieldName}`);
  };

  return (
    <Box sx={{ marginTop: 2, maxWidth: 400 }}>
      {checks.successes.length > 0 && (
        <Box>
          <Accordion expanded={successesExpanded}>
            <AccordionSummary
              indicator={<ExpandMore />}
              onClick={() => setSuccessesExpanded(!successesExpanded)}
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
                {checks.successes.length}
              </Typography>
              <Typography
                level="title-sm"
                fontWeight="bold"
                sx={{ width: '100%' }}
              >
                {successTitle}
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Stack spacing={1}>
                {checks.successes.map((success, index) => (
                  <Alert
                    key={index}
                    color="success"
                    variant="soft"
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <Box>
                      <Typography level="title-sm" fontWeight="bold">
                        {success.category} - {success.title}
                      </Typography>
                    </Box>
                    <Typography level="title-sm" fontWeight="bold">
                      {successPassText}
                    </Typography>
                  </Alert>
                ))}
              </Stack>
            </AccordionDetails>
          </Accordion>
        </Box>
      )}

      {checks.failures.length > 0 && (
        <Box>
          <Accordion expanded={failuresExpanded}>
            <AccordionSummary
              indicator={<ExpandMore />}
              onClick={() => setFailuresExpanded(!failuresExpanded)}
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
                {checks.failures.length}
              </Typography>
              <Typography
                level="title-sm"
                fontWeight="bold"
                sx={{ width: '100%' }}
              >
                {failureTitle}
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Stack spacing={1}>
                {checks.failures.map((failure, index) => (
                  <Alert
                    key={index}
                    color="danger"
                    variant="soft"
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <Box>
                      <Typography level="title-sm" fontWeight="bold">
                        {failure.category}
                        {failure.category && failure.title ? ' - ' : ''}
                        {failure.title}
                      </Typography>
                      <Typography fontSize="xs">
                        {failure.errorMessage}
                      </Typography>
                      {showGoToField &&
                        !config.staticMode &&
                        failure.fieldName && (
                          <Link
                            level="body-sm"
                            component="button"
                            onClick={() =>
                              handleGoToField(cardKey, failure.fieldName!)
                            }
                            sx={{ mt: 1 }}
                          >
                            {goToFieldText || t('goToField')}
                          </Link>
                        )}
                    </Box>
                    <Typography level="title-sm" fontWeight="bold">
                      {failureFailText}
                    </Typography>
                  </Alert>
                ))}
              </Stack>
            </AccordionDetails>
          </Accordion>
        </Box>
      )}
    </Box>
  );
}
