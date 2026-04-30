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

import { forwardRef, useImperativeHandle, useState, useRef } from 'react';
import type { ExpandedLinkType, MetadataValue } from '@/lib/definitions';

import { Box, Stack } from '@mui/joy';
import MetadataView from '@/components/card/metadata-section/MetadataSection';

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
    const bodyRef = useRef<CardBodyHandle>(null);

    useImperativeHandle(
      ref,
      () => ({
        enterBodyEdit: () => {
          bodyRef.current?.enterEdit();
        },
      }),
      [],
    );

    const boxRef = useRef<HTMLDivElement>(null);

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

    return (
      <Stack
        direction={{ xs: 'column', lg: 'row' }}
        height="100%"
        sx={{
          overflowY: { xs: 'auto', lg: 'hidden' },
          scrollbarWidth: 'thin',
        }}
        onScroll={handleScroll}
        ref={boxRef}
      >
        <Box
          width="100%"
          padding={3}
          flexGrow={1}
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
        <Stack
          sx={{
            overflowY: { lg: 'auto' },
            scrollbarWidth: 'thin',
            width: { xs: '100%', lg: 250 },
            minWidth: { lg: 250 },
            flexShrink: 0,
            my: { lg: 2 },
            mr: { lg: 3 },
            px: { xs: 3, lg: 0 },
            pb: { xs: 3, lg: 0 },
          }}
          data-cy="cardSidebar"
        >
          <Box sx={{ marginBottom: 1 }}>
            {editingBody ? (
              <AttachmentPanel
                cardKey={card.key}
                attachments={card.attachments ?? []}
                onInsert={(attachment) =>
                  bodyRef.current?.insertAttachment(attachment)
                }
              />
            ) : (
              <TableOfContents
                htmlContent={htmlContent}
                visibleHeaderIds={visibleHeaderIds}
              />
            )}
          </Box>
          <CardNotifications notifications={card.notifications} />
          <CardPolicyChecks
            policyChecks={card.policyChecks}
            onGoToField={onMetadataUpdate ? setFocusFieldKey : undefined}
          />
        </Stack>
      </Stack>
    );
  },
);
