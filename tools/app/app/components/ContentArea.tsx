/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

'use client';
import React, { useCallback, useEffect, useState } from 'react';
import {
  CardAttachment,
  CardDetails,
  ParsedLink,
  Project,
} from '../lib/definitions';
import Processor from '@asciidoctor/core';
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
import { findCard, getLinksForCard } from '../lib/utils';
import { linktype } from '@cyberismocom/data-handler/interfaces/project-interfaces';
import { default as NextLink } from 'next/link';
import { Add, Delete, Edit, Search } from '@mui/icons-material';
import { Controller, set, useForm } from 'react-hook-form';
import { GenericConfirmModal } from './modals';
import { useAppDispatch, useAppSelector } from '../lib/hooks';
import { viewChanged } from '../lib/slices/pageState';

type ContentAreaProps = {
  project: Project | null;
  card: CardDetails | null;
  error: string | null;
  linkTypes: linktype[] | null;
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
}

interface LinkFormProps {
  linkTypes: linktype[];
  cards: Project['cards'];
  onSubmit?: (data: LinkFormSubmitData) => boolean | Promise<boolean>;
}

export function LinkForm({ cards, linkTypes, onSubmit }: LinkFormProps) {
  const { control, handleSubmit, reset } = useForm<LinkFormSubmitData>({
    defaultValues: { linkType: '', cardKey: '', linkDescription: '' },
  });
  const { t } = useTranslation();
  return (
    <form
      onSubmit={handleSubmit(async (data) => {
        const success = await onSubmit?.(data);
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
                {linkTypes.map((linkType) => (
                  <Option key={linkType.name} value={linkType.name}>
                    {linkType.name}
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
                options={cards.map((c) => ({
                  label: c.metadata?.title || c.key,
                  value: c.key,
                }))}
                isOptionEqualToValue={(option, value) =>
                  option.value === value.value
                }
                onChange={(_, value) => onChange(value?.value || '')}
                value={
                  value
                    ? {
                        label: findCard(cards, value)?.metadata?.title || value,
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
  error,
  linkTypes,
  onMetadataClick,
  onLinkFormSubmit,
  onDeleteLink,
  preview,
  linksVisible,
  onLinkToggle,
}) => {
  const [visibleHeaderId, setVisibleHeaderId] = useState<string | null>(null);

  const [isLinkFormVisible, setLinkFormVisible] = useState(false);
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
  }, [contentRef]);

  const setRef = useCallback((node: HTMLDivElement | null) => {
    setContentRef(node);
  }, []);

  if (error)
    return (
      <Box>
        {t('cardNotFound')} ({error})
      </Box>
    );
  if (!card || !linkTypes) return <Box>{t('loading')}</Box>;

  const links: ParsedLink[] = (card.metadata?.links || [])
    .map((l) => ({
      ...l,
      fromCard: card.key,
    }))
    .concat(project ? getLinksForCard(project.cards, card.key) : []);

  const asciidocContent = card.content ?? '';
  let htmlContent = Processor()
    .convert(asciidocContent, {
      safe: 'safe',
      attributes: {
        imagesdir: `/api/cards/${card.key}/a`,
      },
    })
    .toString();

  // On scroll, check which document headers are visible and update the table of contents scrolling state
  const handleScroll = () => {
    const headers = document.querySelectorAll('.doc h1, .doc h2, .doc h3');
    const visibleHeaderIds: string[] = [];
    let lastTitle: string | null = null;

    const headerArray = Array.from(headers).reverse();

    const boxRect = boxRef.current?.getBoundingClientRect();

    for (const header of headerArray) {
      const rect = header.getBoundingClientRect();
      // we are using 1px offset to make sure the header is in the viewport
      // if top is not available, we want to use 0 which is why we use -1 for the fallback since 1 is the offset
      if (rect.top < (boxRect?.top || -1) + 1) {
        lastTitle = header.id;
        break;
      }
    }

    dispatch(
      viewChanged({
        title: lastTitle,
        cardKey: card.key,
      }),
    );

    // Retain the scroll state if no headers are visible (we are in middle of a longer section)
    if (visibleHeaderIds.length > 0) {
      setVisibleHeaderId(visibleHeaderIds[0]);
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
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
          >
            {(links.length > 0 || linksVisible) && (
              <Typography level="title-sm">{t('linkedCards')}</Typography>
            )}
            {!preview && (links.length > 0 || linksVisible) && (
              <IconButton onClick={onLinkToggle}>
                {linksVisible ? <ChipDelete /> : <Add />}
              </IconButton>
            )}
          </Stack>
          {!preview && linksVisible && (
            <LinkForm
              cards={project?.cards ?? []}
              linkTypes={linkTypes}
              onSubmit={onLinkFormSubmit}
            />
          )}
          <Stack>
            {links.map((link, index) => {
              const linkType = linkTypes.find(
                (linkType) => linkType.name === link.linkType,
              );
              if (!linkType || !project) return null;

              const otherCard = findCard(
                project.cards,
                link.cardKey === card.key ? link.fromCard || '' : link.cardKey,
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
                          ? linkType.outboundDisplayName
                          : linkType.inboundDisplayName}
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
          <Box padding={4}>
            <div
              ref={setRef}
              className="doc"
              dangerouslySetInnerHTML={{ __html: htmlContent }}
            />
          </Box>
        </Stack>
      </Box>
      {renderTableOfContents(htmlContent, visibleHeaderId)}
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
  visibleHeaderId: string | null = null,
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
  const highlightedHeader = visibleHeaderId ?? headers[0]?.id;

  return (
    <aside className="contentSidebar toc sidebar">
      <div className="toc-menu">
        {headers.length > 0 && <h3>TABLE OF CONTENTS</h3>}
        <ul>
          {headers.map((header, index) => (
            <li
              key={index}
              style={{ marginLeft: `${(header.level - 1) * 10}px` }}
            >
              <a
                id={`toc_${header.id}`}
                className={
                  highlightedHeader === header.id ? 'is-active' : undefined
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
