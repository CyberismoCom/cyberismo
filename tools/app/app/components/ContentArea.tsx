/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

'use client';

import React, { ReactElement, useCallback, useEffect, useState } from 'react';
import { CardDetails, ParsedLink, Project } from '../lib/definitions';

import { parse } from 'node-html-parser';
import {
  Box,
  Divider,
  Stack,
  Typography,
  Link,
  IconButton,
  Select,
  Input,
  Button,
  Option,
  Autocomplete,
  ChipDelete,
} from '@mui/joy';
import { useTranslation } from 'react-i18next';
import MetadataView from './MetadataView';
import { findCard, flattenTree, getLinksForCard } from '../lib/utils';
import { LinkType } from '@cyberismocom/data-handler/interfaces/project-interfaces';
import { default as NextLink } from 'next/link';
import { Add, Delete, Edit, Search } from '@mui/icons-material';
import { Controller, useForm } from 'react-hook-form';
import { GenericConfirmModal } from './modals';

import { useAppDispatch, useAppSelector } from '../lib/hooks';
import { viewChanged } from '../lib/slices/pageState';

import {
  MacroMetadata,
} from '@cyberismocom/data-handler/interfaces/macros';
import {
  macroMetadata,
} from '@cyberismocom/data-handler/macros/common'
import { UIMacroName, macros as UImacros } from './macros';
import parseReact from 'html-react-parser';

type ContentAreaProps = {
  project: Project | null;
  card: CardDetails & {
    parsed: string;
  };
  linkTypes: LinkType[];
  onMetadataClick?: () => void;
  onLinkFormSubmit?: (data: LinkFormSubmitData) => boolean | Promise<boolean>;
  onDeleteLink?: (data: ParsedLink) => void | Promise<void>;
  preview?: boolean;
  linksVisible?: boolean;
  onLinkToggle?: () => void;
};

interface LinkFormSubmitData {
  linkType: string;
  cardKey: string;
  linkDescription: string;
  direction: 'inbound' | 'outbound';
}

interface LinkFormData {
  linkType: number;
  cardKey: string;
  linkDescription: string;
}

interface LinkFormProps {
  linkTypes: LinkType[];
  cards: Project['cards'];
  cardType: string | undefined;
  onSubmit?: (data: LinkFormSubmitData) => boolean | Promise<boolean>;
}

const NO_LINK_TYPE = -1;

export function LinkForm({
  cards,
  linkTypes,
  onSubmit,
  cardType,
}: LinkFormProps) {
  const { control, handleSubmit, reset, watch } = useForm<LinkFormData>({
    defaultValues: { linkType: NO_LINK_TYPE, cardKey: '', linkDescription: '' },
  });
  const { t } = useTranslation();

  const handledLinkTypes: (LinkType & {
    direction: 'inbound' | 'outbound';
    id: number;
  })[] = [];

  let id = 0;
  for (const type of linkTypes) {
    if (!cardType) continue;
    // Check if this card is in from or to list
    if (
      type.sourceCardTypes.includes(cardType) ||
      type.sourceCardTypes.length === 0
    ) {
      handledLinkTypes.push({
        ...type,
        direction: 'outbound',
        id: id++,
      });
    }
    if (
      type.destinationCardTypes.includes(cardType) ||
      type.destinationCardTypes.length === 0
    ) {
      handledLinkTypes.push({
        ...type,
        direction: 'inbound',
        id: id++,
      });
    }
  }

  // find chosen link type
  const linkType = watch('linkType');
  const selectedLinkType = handledLinkTypes.find((t) => t.id === linkType);

  const usableCards = flattenTree(cards).filter((card) => {
    if (!selectedLinkType) return false;
    if (selectedLinkType.direction === 'outbound') {
      return (
        selectedLinkType.destinationCardTypes.includes(
          card.metadata?.cardType || '',
        ) || selectedLinkType.destinationCardTypes.length === 0
      );
    } else {
      return (
        selectedLinkType.sourceCardTypes.includes(
          card.metadata?.cardType || '',
        ) || selectedLinkType.sourceCardTypes.length === 0
      );
    }
  });

  return (
    <form
      onSubmit={handleSubmit(async (data) => {
        const linkType = handledLinkTypes.find((t) => t.id === data.linkType);
        if (!linkType) return;
        const success = await onSubmit?.({
          linkType: linkType.name,
          cardKey: data.cardKey,
          linkDescription: data.linkDescription,
          direction: linkType.direction,
        });
        if (success) reset();
      })}
    >
      <Stack spacing={1}>
        <Stack direction="row" spacing={1}>
          <Controller
            name="linkType"
            control={control}
            render={({ field }) => (
              <Select
                {...field}
                placeholder={t('linkForm.selectLinkType')}
                color="primary"
                onChange={(_, value) => field.onChange(value)}
                sx={{
                  width: 180,
                }}
                required={true}
              >
                {handledLinkTypes.map((linkType) => (
                  <Option key={linkType.id} value={linkType.id}>
                    {linkType.direction === 'outbound'
                      ? linkType.outboundDisplayName
                      : linkType.inboundDisplayName}
                  </Option>
                ))}
              </Select>
            )}
          />
          <Controller
            name="cardKey"
            control={control}
            render={({ field: { onChange, value } }) => (
              <Autocomplete
                color="primary"
                required={true}
                placeholder={t('linkForm.searchCard')}
                options={usableCards.map((c) => ({
                  label: `${c.metadata?.title} (${c.key})`,
                  value: c.key,
                }))}
                isOptionEqualToValue={(option, value) =>
                  option.value === value.value
                }
                onChange={(_, value) => onChange(value?.value || '')}
                value={
                  value
                    ? {
                        label: `${findCard(cards, value)?.metadata?.title}(${value})`,
                        value,
                      }
                    : null
                }
                startDecorator={<Search />}
                sx={{
                  flexGrow: 1,
                }}
              />
            )}
          />
        </Stack>

        {selectedLinkType && selectedLinkType.enableLinkDescription && (
          <Controller
            name="linkDescription"
            control={control}
            render={({ field }) => (
              <Input
                {...field}
                color="primary"
                startDecorator={<Edit />}
                placeholder={t('linkForm.writeDescription')}
              />
            )}
          />
        )}
        <Button
          type="submit"
          sx={{
            width: '100px',
            alignSelf: 'flex-end',
          }}
        >
          {t('linkForm.button')}
        </Button>
      </Stack>
    </form>
  );
}

export const ContentArea: React.FC<ContentAreaProps> = ({
  project,
  card,
  linkTypes,
  onMetadataClick,
  onLinkFormSubmit,
  onDeleteLink,
  preview,
  linksVisible,
  onLinkToggle,
}) => {
  const [visibleHeaderIds, setVisibleHeaderIds] = useState<string[] | null>(
    null,
  );

  const [isDeleteLinkModalVisible, setDeleteLinkModalVisible] = useState(false); // replace with usemodals if you add more modals
  const [deleteLinkData, setDeleteLinkData] = useState<ParsedLink | null>(null);

  const boxRef = React.createRef<HTMLDivElement>();

  const [contentRef, setContentRef] = useState<HTMLDivElement | null>(null);

  const dispatch = useAppDispatch();

  const { t } = useTranslation();

  const lastTitle = useAppSelector((state) => state.page.title);
  const cardKey = useAppSelector((state) => state.page.cardKey);
  // scroll to last title on first render and when tab is changed
  useEffect(() => {
    if (lastTitle && contentRef && cardKey === card?.key) {
      const header = document.getElementById(lastTitle);
      if (header) {
        header.scrollIntoView();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentRef]);

  const setRef = useCallback((node: HTMLDivElement | null) => {
    setContentRef(node);
  }, []);

  const links: ParsedLink[] = (card.metadata?.links || [])
    .map((l) => ({
      ...l,
      fromCard: card.key,
    }))
    .concat(project ? getLinksForCard(project.cards, card.key) : []);

  const htmlContent = card.parsed || '';

  const combinedMacros = Object.entries(macroMetadata).reduce<
    (MacroMetadata & { component: (props: any) => ReactElement })[]
  >((acc, [key, value]) => {
    acc.push({
      ...value,
      component: UImacros[key as UIMacroName] ?? (() => <>err</>),
    });
    return acc;
  }, []);

  const parsedContent = parseReact(htmlContent, {
    replace: (node) => {
      if (node.type === 'tag') {
        const macro = combinedMacros.find((m) => m.tagName === node.name);
        if (macro) {
          return macro.component({
            ...node.attribs,
            key: card.key,
            preview,
          });
        }
      }
    },
    htmlparser2: {
      lowerCaseAttributeNames: false,
    },
  });

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
    <Stack direction="row" height="100%">
      <Box
        width="100%"
        padding={3}
        flexGrow={1}
        minWidth={0}
        sx={{
          overflowY: 'scroll',
          scrollbarWidth: 'thin',
        }}
        onScroll={handleScroll}
        ref={boxRef}
      >
        <Stack spacing={3}>
          <Typography level="h1">{card.metadata?.title ?? card.key}</Typography>
          <MetadataView
            editMode={false}
            initialExpanded={false}
            metadata={card?.metadata}
            onClick={onMetadataClick}
          />
          {(links.length > 0 || linksVisible) && (
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="center"
            >
              <Typography level="title-sm">{t('linkedCards')}</Typography>
              {!preview &&
                (linksVisible ? (
                  <ChipDelete onDelete={onLinkToggle} />
                ) : (
                  <IconButton onClick={onLinkToggle}>
                    <Add />
                  </IconButton>
                ))}
            </Stack>
          )}
          {!preview && linksVisible && (
            <LinkForm
              cards={project?.cards ?? []}
              linkTypes={linkTypes}
              onSubmit={onLinkFormSubmit}
              cardType={card.metadata?.cardType}
            />
          )}
          {links.length > 0 && (
            <Stack>
              {links.map((link, index) => {
                const linkType = linkTypes.find(
                  (linkType) => linkType.name === link.linkType,
                );
                if (!linkType || !project) return null;

                const otherCard = findCard(
                  project.cards,
                  link.cardKey === card.key
                    ? link.fromCard || ''
                    : link.cardKey,
                );

                if (!otherCard) return null;

                return (
                  <Box
                    bgcolor="neutral.softBg"
                    borderRadius={16}
                    marginY={0.5}
                    paddingY={2}
                    paddingX={3}
                    flexDirection="row"
                    display="flex"
                    key={index}
                    alignItems="center"
                    justifyContent="space-between"
                    sx={{
                      '&:hover .deleteButton': {
                        opacity: 1,
                      },
                      '& .deleteButton': {
                        opacity: 0,
                        transition: 'opacity 0.2s',
                      },
                    }}
                  >
                    <Stack>
                      <Stack direction="row" alignItems="center">
                        <Typography level="body-sm" paddingRight={2}>
                          {link.cardKey === card.key
                            ? linkType.inboundDisplayName
                            : linkType.outboundDisplayName}
                        </Typography>
                        <NextLink href={`/cards/${otherCard?.key}`}>
                          <Link component={'div'}>{otherCard?.key}</Link>
                        </NextLink>
                        <Divider
                          orientation="vertical"
                          sx={{
                            marginX: 1,
                          }}
                        />
                        <Typography level="title-sm">
                          {otherCard?.metadata?.title}
                        </Typography>
                      </Stack>
                      <Typography level="body-sm">
                        {link.linkDescription}
                      </Typography>
                    </Stack>
                    <IconButton
                      className="deleteButton"
                      onClick={() => {
                        setDeleteLinkModalVisible(true);
                        setDeleteLinkData(link);
                      }}
                    >
                      <Delete fontSize="small" />
                    </IconButton>
                  </Box>
                );
              })}
            </Stack>
          )}
          <Box pl={4} pr={4} mt={0}>
            <div className="doc" ref={setRef}>
              {parsedContent}
            </div>
          </Box>
        </Stack>
      </Box>
      {renderTableOfContents(htmlContent, visibleHeaderIds)}
      {!preview && (
        <GenericConfirmModal
          open={isDeleteLinkModalVisible}
          onClose={() => {
            setDeleteLinkModalVisible(false);
          }}
          onConfirm={async () => {
            console.log(deleteLinkData, onDeleteLink);
            if (deleteLinkData) {
              await onDeleteLink?.(deleteLinkData);
            }
            setDeleteLinkModalVisible(false);
          }}
          title={t('deleteLink')}
          content={t('deleteLinkConfirm')}
          confirmText={t('delete')}
        />
      )}
    </Stack>
  );
};

function renderTableOfContents(
  htmlContent: string,
  visibleHeaderIds: string[] | null = null,
) {
  // Parse the HTML content
  const root = parse(htmlContent);
  // Find all header tags
  const headers = root.querySelectorAll('h1, h2, h3').map((header) => ({
    id:
      header.getAttribute('id') ||
      header.text.trim().replace(/\s+/g, '-').toLowerCase(), // Create an id if it doesn't exist
    text: header.text,
    level: parseInt(header.tagName[1]),
  }));

  // Hack for first render: mark first header as visible, after this updates via handleScroll
  const highlightedHeaders = visibleHeaderIds ?? [headers[0]?.id ?? ''];

  return (
    <aside className="contentSidebar toc sidebar">
      <div className="toc-menu">
        {headers.length > 0 && <h3>TABLE OF CONTENTS</h3>}
        <ul>
          {headers.map((header, index) => (
            <li key={index} data-level={header.level - 1}>
              <a
                id={`toc_${header.id}`}
                className={
                  highlightedHeaders.includes(header.id)
                    ? 'is-active'
                    : undefined
                }
                href={`#${header.id}`}
              >
                {header.text}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
