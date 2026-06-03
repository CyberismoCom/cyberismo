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

import {
  forwardRef,
  useImperativeHandle,
  useState,
  useRef,
  type ReactNode,
} from 'react';
import type { ExpandedLinkType, MetadataValue } from '@/lib/definitions';

import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Stack,
  Typography,
} from '@mui/joy';
import { useTheme } from '@mui/material/styles';
import { useMediaQuery } from '@mui/material';
import ExpandMore from '@mui/icons-material/ExpandMore';
import Toc from '@mui/icons-material/Toc';
import { useTranslation } from 'react-i18next';
import MetadataView from '@/components/card/metadata-section/MetadataSection';
import { CountBadge, LeadingSlot } from '@/components/CountBadge';

import { useAppDispatch, useAppSelector } from '@/lib/hooks';
import { viewChanged } from '@/lib/slices/pageState';

import type {
  QueryResult,
  CalculationLink,
} from '@cyberismo/data-handler/types/queries';
import type { CardResponse, Connector } from '@/lib/api/types';
import LinkedCardsSection, {
  type LinkFormState,
  type LinkFormSubmitData,
} from '@/components/card/linked-cards-section/LinkedCardsSection';
import { CardNotifications } from './CardNotifications';
import { CardPolicyChecks } from './CardPolicyChecks';
import { TableOfContents } from './TableOfContents';
import { CardBody, type CardBodyHandle } from './CardBody';
import { CardTitle } from './CardTitle';
import { AttachmentPanel } from './AttachmentPanel';

function SidebarPanelAccordion({
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

type CardLayoutProps = {
  cards: QueryResult<'tree'>[];
  card: CardResponse;
  linkTypes: ExpandedLinkType[];
  connectors?: Connector[];
  onMetadataUpdate?: (update: {
    metadata: Record<string, MetadataValue>;
  }) => Promise<void>;
  onContentSave?: (content: string) => Promise<void>;
  onLinkFormSubmit?: (data: LinkFormSubmitData) => boolean | Promise<boolean>;
  onDeleteLink?: (data: CalculationLink) => void | Promise<void>;
  preview?: boolean;
  linkFormState: LinkFormState;
  onLinkFormChange?: (state: LinkFormState) => void;
  onEditingChange?: (editing: boolean) => void;
};

export type CardLayoutHandle = {
  enterBodyEdit: () => void;
};

export const CardLayout = forwardRef<CardLayoutHandle, CardLayoutProps>(
  function CardLayout(
    {
      card,
      cards,
      linkTypes,
      connectors,
      onMetadataUpdate,
      onContentSave,
      onLinkFormSubmit,
      preview,
      linkFormState,
      onLinkFormChange,
      onDeleteLink,
      onEditingChange,
    },
    ref,
  ) {
    const [visibleHeaderIds, setVisibleHeaderIds] = useState<string[] | null>(
      null,
    );

    const [focusFieldKey, setFocusFieldKey] = useState<string | null>(null);

    const [editingBody, setEditingBody] = useState(false);
    const [tocExpanded, setTocExpanded] = useState(false);
    const [notificationsExpanded, setNotificationsExpanded] = useState(false);
    const bodyRef = useRef<CardBodyHandle>(null);

    const { t } = useTranslation();
    const theme = useTheme();
    const isNarrow = useMediaQuery(theme.breakpoints.down('lg'), {
      noSsr: true,
    });

    useImperativeHandle(
      ref,
      () => ({
        enterBodyEdit: () => {
          bodyRef.current?.enterEdit();
        },
      }),
      [],
    );

    const dispatch = useAppDispatch();

    const lastTitle = useAppSelector((state) => state.page.title);
    const cardKey = useAppSelector((state) => state.page.cardKey);

    const htmlContent = card.parsedContent || '';

    // On scroll, check which document headers are visible and update state accordingly
    const handleScroll = () => {
      const headers = document.querySelectorAll('.doc h1, .doc h2, .doc h3');
      const onScreenHeaderIds: string[] = [];
      headers.forEach((header) => {
        const rect = header.getBoundingClientRect();
        if (
          rect.top >= 0 &&
          rect.bottom <= window.innerHeight &&
          header.id &&
          header.id !== ''
        ) {
          onScreenHeaderIds.push(header.id);
        }
      });

      // If no headers are visible, we are in the middle of a long section and should not update anything
      if (onScreenHeaderIds.length > 0) {
        const firstVisibleHeaderId = onScreenHeaderIds[0];
        const lastVisibleHeaderId =
          onScreenHeaderIds[onScreenHeaderIds.length - 1];
        const lastHeaderVisible =
          lastVisibleHeaderId === headers[headers.length - 1].id;

        // Update table of contents highlight
        // When scrolling to end, highlight all headers on screen
        if (lastHeaderVisible) {
          setVisibleHeaderIds(onScreenHeaderIds);
        } else {
          setVisibleHeaderIds([firstVisibleHeaderId]);
        }

        if (lastTitle === firstVisibleHeaderId && cardKey === card.key) return;

        // Don't scroll upon edit if we are at top of document (first header visible)
        const shouldScroll = !onScreenHeaderIds.includes(headers[0].id);

        // Save current position for switching between edit/view modes
        dispatch(
          viewChanged({
            title: shouldScroll ? firstVisibleHeaderId : null,
            cardKey: card.key,
          }),
        );
      }
    };

    const hasHeaders = /<h[123]\b/i.test(htmlContent);
    const hasNotifications = card.notifications.length > 0;
    const hasPolicyChecks =
      card.policyChecks.successes.length > 0 ||
      card.policyChecks.failures.length > 0;
    const notificationsBadgeCount =
      card.notifications.length + card.policyChecks.failures.length;

    const attachmentPanel = (
      <AttachmentPanel
        cardKey={card.key}
        attachments={card.attachments ?? []}
        onInsert={(attachment) => bodyRef.current?.insertAttachment(attachment)}
      />
    );

    const viewSidebarContent = (
      <>
        <Box sx={{ marginBottom: 1 }}>
          <TableOfContents
            htmlContent={htmlContent}
            visibleHeaderIds={visibleHeaderIds}
          />
        </Box>
        <CardNotifications notifications={card.notifications} />
        <CardPolicyChecks
          policyChecks={card.policyChecks}
          onGoToField={onMetadataUpdate ? setFocusFieldKey : undefined}
        />
      </>
    );

    return (
      <Stack
        direction={{ xs: 'column', lg: 'row' }}
        height="100%"
        sx={{
          overflowY: { xs: 'auto', lg: 'hidden' },
          scrollbarWidth: 'thin',
        }}
        onScroll={handleScroll}
      >
        <Box
          width="100%"
          padding={{ xs: 2, sm: 3 }}
          flexGrow={1}
          onScroll={handleScroll}
          sx={{
            overflowY: { lg: 'auto' },
            scrollbarWidth: 'thin',
            paddingBottom: 0,
            // Safari stuff
            '&::after': {
              content: '""',
              display: 'block',
              height: (theme) => theme.spacing(3),
            },
          }}
        >
          <Stack spacing={2}>
            <CardTitle
              title={card.title}
              preview={preview}
              disabled={card.deniedOperations.editField
                .map((f) => f.fieldName)
                .includes('title')}
              onSave={onMetadataUpdate}
            />
            <MetadataView
              initialExpanded={false}
              card={card}
              onUpdate={onMetadataUpdate}
              focusFieldKey={focusFieldKey}
              onFieldFocused={() => setFocusFieldKey(null)}
            />
            <LinkedCardsSection
              card={card}
              cards={cards}
              linkTypes={linkTypes}
              connectors={connectors}
              preview={preview}
              linkFormState={linkFormState}
              onLinkFormChange={onLinkFormChange}
              onLinkFormSubmit={onLinkFormSubmit}
              onDeleteLink={onDeleteLink}
            />
            {isNarrow && editingBody && attachmentPanel}
            {isNarrow &&
              !editingBody &&
              (hasNotifications || hasPolicyChecks) && (
                <SidebarPanelAccordion
                  expanded={notificationsExpanded}
                  onToggle={() =>
                    setNotificationsExpanded(!notificationsExpanded)
                  }
                  leading={<CountBadge count={notificationsBadgeCount} />}
                  title={t('notificationsAndChecks')}
                  dataCy="cardNotificationsPanel"
                >
                  <Stack spacing={2}>
                    <CardNotifications
                      notifications={card.notifications}
                      collapsible={false}
                    />
                    <CardPolicyChecks
                      policyChecks={card.policyChecks}
                      onGoToField={
                        onMetadataUpdate ? setFocusFieldKey : undefined
                      }
                      collapsible={false}
                    />
                  </Stack>
                </SidebarPanelAccordion>
              )}
            {isNarrow && !editingBody && hasHeaders && (
              <SidebarPanelAccordion
                expanded={tocExpanded}
                onToggle={() => setTocExpanded(!tocExpanded)}
                leading={
                  <LeadingSlot>
                    <Toc fontSize="small" />
                  </LeadingSlot>
                }
                title={t('tableOfContents')}
                dataCy="cardTocPanel"
              >
                <TableOfContents
                  htmlContent={htmlContent}
                  visibleHeaderIds={visibleHeaderIds}
                  inline
                />
              </SidebarPanelAccordion>
            )}
            <CardBody
              ref={bodyRef}
              card={card}
              preview={preview}
              onContentSave={onContentSave}
              onEditingChange={(editing) => {
                setEditingBody(editing);
                onEditingChange?.(editing);
              }}
            />
          </Stack>
        </Box>
        {!isNarrow && (
          <Stack
            sx={{
              overflowY: 'auto',
              scrollbarWidth: 'thin',
              width: 250,
              minWidth: 250,
              flexShrink: 0,
              my: 2,
              mr: 3,
            }}
            data-cy="cardSidebar"
          >
            {editingBody ? attachmentPanel : viewSidebarContent}
          </Stack>
        )}
      </Stack>
    );
  },
);
