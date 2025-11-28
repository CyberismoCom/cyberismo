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
  Card,
  CardContent,
  CardOverflow,
  AspectRatio,
  Grid,
  IconButton,
  Tooltip,
  Link,
} from '@mui/joy';
import { ChecksAccordion } from './ChecksAccordion';
import ExpandMore from '@mui/icons-material/ExpandMore';
import InsertDriveFile from '@mui/icons-material/InsertDriveFile';
import Download from '@mui/icons-material/Download';
import { useTranslation } from 'react-i18next';
import { CardResponse } from '@/lib/api/types';
import {
  PolicyCheckCollection,
  Notification,
} from '@cyberismo/data-handler/types/queries';
import { apiPaths } from '@/lib/swr';
import type { CardAttachment } from '@cyberismo/data-handler/interfaces/project-interfaces';

interface ContentSidebarProps {
  card: CardResponse;
  htmlContent: string;
  visibleHeaderIds?: string[] | null;
  onNavigate?: () => void; // called when a TOC link is clicked (mobile drawer close)
  showAttachments?: boolean; // Show attachments section (for edit mode on mobile)
  onAddAttachment?: () => void; // Callback to open add attachment modal
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

// Attachments panel for mobile edit mode
const AttachmentsPanel = ({
  attachments,
  cardKey,
  onAddAttachment,
}: {
  attachments: CardAttachment[];
  cardKey: string;
  onAddAttachment?: () => void;
}) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = React.useState(true);

  return (
    <Box sx={{ marginTop: 2 }}>
      <Accordion expanded={expanded}>
        <AccordionSummary
          indicator={<ExpandMore />}
          onClick={() => setExpanded(!expanded)}
          sx={{ borderRadius: '4px', mt: 1, mb: 1 }}
        >
          <Typography
            level="body-xs"
            color="warning"
            variant="soft"
            width={24}
            height={24}
            alignContent="center"
            borderRadius={40}
            ml={0}
            px={1.1}
          >
            {attachments.length}
          </Typography>
          <Typography level="title-sm" fontWeight="bold" sx={{ width: '100%' }}>
            {attachments.length === 1 ? t('attachment') : t('attachments')}
          </Typography>
          {onAddAttachment && (
            <Tooltip title={t('addAttachment')}>
              <IconButton
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddAttachment();
                }}
              >
                <img
                  alt="Add attachment"
                  width={20}
                  height={20}
                  src="/images/attach_file_add.svg"
                />
              </IconButton>
            </Tooltip>
          )}
        </AccordionSummary>
        <AccordionDetails>
          <Grid container spacing={1}>
            {attachments.map((attachment) => (
              <Grid key={attachment.fileName} xs={6}>
                <Card size="sm" sx={{ height: '100%' }}>
                  <CardOverflow>
                    <AspectRatio ratio="4/3" objectFit="contain">
                      {attachment.mimeType?.startsWith('image') ? (
                        <img
                          src={apiPaths.attachment(cardKey, attachment.fileName)}
                          alt={attachment.fileName}
                        />
                      ) : (
                        <Box
                          display="flex"
                          alignItems="center"
                          justifyContent="center"
                        >
                          <InsertDriveFile sx={{ fontSize: 40, opacity: 0.5 }} />
                        </Box>
                      )}
                    </AspectRatio>
                  </CardOverflow>
                  <CardContent>
                    <Typography
                      level="body-xs"
                      noWrap
                      title={attachment.fileName}
                    >
                      {attachment.fileName}
                    </Typography>
                    <Link
                      level="body-xs"
                      href={apiPaths.attachment(cardKey, attachment.fileName)}
                      download
                      startDecorator={<Download sx={{ fontSize: 14 }} />}
                    >
                      {t('saveCopy')}
                    </Link>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </AccordionDetails>
      </Accordion>
    </Box>
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
  showAttachments,
  onAddAttachment,
}) => {
  const { t } = useTranslation();
  return (
    <Stack
      m={2}
      flexGrow={1}
      sx={{ overflowY: 'auto', scrollbarWidth: 'thin' }}
      data-cy="cardSidebar"
    >
      {showAttachments && card.attachments && (
        <AttachmentsPanel
          attachments={card.attachments}
          cardKey={card.key}
          onAddAttachment={onAddAttachment}
        />
      )}
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
