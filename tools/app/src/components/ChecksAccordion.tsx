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
import { CountBadge } from './CountBadge';
import { UserRole, useHasMinRole } from '@/lib/auth';

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
  successTitle: string;
  failureTitle: string;
  successPassText: string;
  failureFailText: string;
  initialSuccessesExpanded?: boolean;
  initialFailuresExpanded?: boolean;
  goToFieldText?: string;
  onGoToField?: (fieldName: string) => void;
  collapsible?: boolean;
}

export function ChecksAccordion({
  checks,
  successTitle,
  failureTitle,
  successPassText,
  failureFailText,
  initialSuccessesExpanded = false,
  initialFailuresExpanded = true,
  goToFieldText,
  onGoToField,
  collapsible = true,
}: ChecksAccordionProps) {
  const { t } = useTranslation();
  const [successesExpanded, setSuccessesExpanded] = useState(
    initialSuccessesExpanded,
  );
  const [failuresExpanded, setFailuresExpanded] = useState(
    initialFailuresExpanded,
  );
  const canEdit = useHasMinRole(UserRole.Editor);

  if (checks.successes.length === 0 && checks.failures.length === 0) {
    return null;
  }

  const renderBadge = (count: number) => <CountBadge count={count} />;

  const renderTitle = (title: string) => (
    <Typography
      level={collapsible ? 'title-sm' : 'body-xs'}
      fontWeight={collapsible ? 'bold' : 'lg'}
      sx={{ flexGrow: 1 }}
    >
      {title}
    </Typography>
  );

  const successItems = (
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
  );

  const failureItems = (
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
            <Typography fontSize="xs">{failure.errorMessage}</Typography>
            {onGoToField && canEdit && failure.fieldName && (
              <Link
                data-cy="goToFieldLink"
                level="body-sm"
                component="button"
                onClick={() => onGoToField(failure.fieldName!)}
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
  );

  if (!collapsible) {
    return (
      <>
        {checks.successes.length > 0 && (
          <Stack spacing={1}>
            <Stack direction="row" alignItems="center" spacing={2}>
              {renderBadge(checks.successes.length)}
              {renderTitle(successTitle)}
            </Stack>
            {successItems}
          </Stack>
        )}
        {checks.failures.length > 0 && (
          <Stack spacing={1}>
            <Stack direction="row" alignItems="center" spacing={2}>
              {renderBadge(checks.failures.length)}
              {renderTitle(failureTitle)}
            </Stack>
            {failureItems}
          </Stack>
        )}
      </>
    );
  }

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
              {renderBadge(checks.successes.length)}
              {renderTitle(successTitle)}
            </AccordionSummary>
            <AccordionDetails>{successItems}</AccordionDetails>
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
              {renderBadge(checks.failures.length)}
              {renderTitle(failureTitle)}
            </AccordionSummary>
            <AccordionDetails>{failureItems}</AccordionDetails>
          </Accordion>
        </Box>
      )}
    </Box>
  );
}
