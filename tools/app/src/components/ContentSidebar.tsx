/**
 * Sidebar portion of ContentArea (Table of Contents + Notifications + Policy Checks)
 * Extracted for reuse inside mobile Drawer.
 */
import React from 'react';
import { parse } from 'node-html-parser';
import {
  Box,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Alert,
  Stack,
} from '@mui/joy';
import { ChecksAccordion } from './ChecksAccordion';
import ExpandMore from '@mui/icons-material/ExpandMore';
import { useTranslation } from 'react-i18next';
import { CardResponse } from '@/lib/api/types';
import {
  PolicyCheckCollection,
  Notification,
} from '@cyberismo/data-handler/types/queries';

interface ContentSidebarProps {
  card: CardResponse;
  htmlContent: string;
  visibleHeaderIds?: string[] | null;
  onNavigate?: () => void; // called when a TOC link is clicked (mobile drawer close)
}

// Local copies of small presentational components (mirroring original file)
const NotificationsList = ({
  notifications,
}: {
  notifications: Notification[];
}) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = React.useState(true);
  if (notifications.length === 0) return null;
  return (
    <Box sx={{ marginTop: 2, maxWidth: 400 }}>
      <Accordion expanded={expanded}>
        <AccordionSummary
          indicator={<ExpandMore />}
          onClick={() => setExpanded(!expanded)}
          sx={{ borderRadius: '4px', mt: 1, mb: 1 }}
        >
          <Typography
            level="body-xs"
            color="primary"
            variant="soft"
            width={24}
            height={24}
            alignContent="center"
            borderRadius={40}
            ml={0}
            px={1.1}
          >
            {notifications.length}
          </Typography>
          <Typography level="title-sm" fontWeight="bold" sx={{ width: '100%' }}>
            {t('notifications')}
          </Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Stack spacing={1}>
            {notifications.map((n, i) => (
              <Alert
                key={i}
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
                    {n.category} - {n.title}
                  </Typography>
                  <Typography fontSize="xs">{n.message}</Typography>
                </Box>
              </Alert>
            ))}
          </Stack>
        </AccordionDetails>
      </Accordion>
    </Box>
  );
};

const PolicyChecks = ({
  policyChecks,
  cardKey,
}: {
  policyChecks: PolicyCheckCollection;
  cardKey: string;
}) => {
  const { t } = useTranslation();
  const checksData = {
    successes: policyChecks.successes,
    failures: policyChecks.failures,
  };
  return (
    <ChecksAccordion
      checks={checksData}
      cardKey={cardKey}
      successTitle={t('passedPolicyChecks')}
      failureTitle={t('failedPolicyChecks')}
      successPassText={t('policyCheckPass')}
      failureFailText={t('policyCheckFail')}
      goToFieldText={t('goToField')}
      initialSuccessesExpanded={false}
      initialFailuresExpanded={true}
    />
  );
};

function renderTableOfContents(
  title: string,
  htmlContent: string,
  visibleHeaderIds: string[] | null = null,
  onNavigate?: () => void,
) {
  const root = parse(htmlContent);
  const headers = root.querySelectorAll('h1, h2, h3').map((header) => ({
    id:
      header.getAttribute('id') ||
      header.text.trim().replace(/\s+/g, '-').toLowerCase(),
    text: header.text,
    level: parseInt(header.tagName[1]),
  }));
  const highlightedHeaders = visibleHeaderIds ?? [headers[0]?.id ?? ''];
  return (
    <aside className="contentSidebar toc sidebar">
      <div className="toc-menu" style={{ marginLeft: 2 }}>
        {headers.length > 0 && (
          <Typography level="title-sm" fontWeight="bold">
            {title}
          </Typography>
        )}
        <ul>
          {headers.map((h, i) => (
            <li key={i} data-level={h.level - 1}>
              <a
                id={`toc_${h.id}`}
                className={
                  highlightedHeaders.includes(h.id) ? 'is-active' : undefined
                }
                href={`#${h.id}`}
                onClick={() => {
                  // allow default anchor behavior (hash navigation), then signal
                  setTimeout(() => onNavigate && onNavigate(), 0);
                }}
              >
                {h.text}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

export const ContentSidebar: React.FC<ContentSidebarProps> = ({
  card,
  htmlContent,
  visibleHeaderIds,
  onNavigate,
}) => {
  const { t } = useTranslation();
  return (
    <Stack
      m={2}
      flexGrow={1}
      sx={{ overflowY: 'auto', scrollbarWidth: 'thin' }}
      data-cy="cardSidebar"
    >
      <Box sx={{ mb: 1 }}>
        {renderTableOfContents(
          t('tableOfContents'),
          htmlContent,
          visibleHeaderIds,
          onNavigate,
        )}
      </Box>
      <NotificationsList notifications={card.notifications} />
      <PolicyChecks policyChecks={card.policyChecks} cardKey={card.key} />
    </Stack>
  );
};

export default ContentSidebar;
