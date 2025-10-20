/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2024

  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import type { ReactElement } from 'react';
import React, { useCallback, useEffect, useState, useRef } from 'react';
import type { ExpandedLinkType } from '../lib/definitions';

import { parse } from 'node-html-parser';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Autocomplete,
  Box,
  Button,
  Divider,
  IconButton,
  Input,
  Link,
  Option,
  Select,
  Stack,
  Typography,
  Tooltip,
} from '@mui/joy';
import { useTranslation } from 'react-i18next';
import { renderToStaticMarkup } from 'react-dom/server';
import MetadataView from './MetadataView';
import { ChecksAccordion, type CheckCollection } from './ChecksAccordion';
import {
  canCreateLinkToCard,
  createPredicate,
  findCard,
  flattenTree,
  useModals,
  parseDataAttributes,
} from '../lib/utils';
import { Link as RouterLink, useLocation } from 'react-router';
import Add from '@mui/icons-material/Add';
import Delete from '@mui/icons-material/Delete';
import Edit from '@mui/icons-material/Edit';
import ExpandMore from '@mui/icons-material/ExpandMore';
import DownloadIcon from '@mui/icons-material/Download';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import Search from '@mui/icons-material/Search';
import Info from '@mui/icons-material/Info';

import { Controller, useForm } from 'react-hook-form';
import EditLinkModal from './modals/EditLinkModal';

import { useAppDispatch, useAppSelector } from '../lib/hooks';
import { viewChanged } from '../lib/slices/pageState';

import type { MacroMetadata } from '@cyberismo/data-handler/interfaces/macros';
import { macroMetadata } from '@cyberismo/data-handler/macros/common';
import type { UIMacroName } from './macros';
import { macros as UImacros } from './macros';
import parseReact from 'html-react-parser';
import type {
  PolicyCheckCollection,
  Notification,
  QueryResult,
  CalculationLink,
  LinkDirection,
} from '@cyberismo/data-handler/types/queries';
import { config } from '@/lib/utils';
import type { CardResponse } from '../lib/api/types';
import { GenericConfirmModal } from './modals';
import { useCard } from '../lib/api';
import SvgViewerModal from './modals/svgViewerModal';

export type LinkFormState = 'hidden' | 'add' | 'add-from-toolbar' | 'edit';

type ContentAreaProps = {
  cards: QueryResult<'tree'>[];
  card: CardResponse;
  linkTypes: ExpandedLinkType[];
  onMetadataClick?: () => void;
  onLinkFormSubmit?: (data: LinkFormSubmitData) => boolean | Promise<boolean>;
  onDeleteLink?: (data: CalculationLink) => void | Promise<void>;
  preview?: boolean;
  linkFormState: LinkFormState;
  onLinkFormChange?: (state: LinkFormState) => void;
};

interface HTMLElementWithCleanup extends HTMLElement {
  __cleanupSvgControls?: () => void;
}

interface LinkFormSubmitData {
  linkType: string;
  cardKey: string;
  linkDescription: string;
  direction: LinkDirection;
  previousLinkType?: string;
  previousCardKey?: string;
  previousLinkDescription?: string;
  previousDirection?: LinkDirection;
}

interface LinkFormData {
  linkType: number;
  cardKey: string;
  linkDescription: string;
}

interface LinkFormProps {
  linkTypes: ExpandedLinkType[];
  cards: QueryResult<'tree'>[];
  onSubmit?: (data: LinkFormSubmitData) => boolean | Promise<boolean>;
  onCancel?: () => void;
  cardKey: string;
  currentCardLinks: CalculationLink[];
  state: LinkFormState;
  data?: LinkFormData;
  inModal?: boolean;
  formRef?: React.RefObject<HTMLFormElement | null>;
  isLoading?: boolean;
  isUpdating?: boolean;
}

const NO_LINK_TYPE = -1;

const DEFAULT_LINK_FORM_DATA: LinkFormData = {
  linkType: NO_LINK_TYPE,
  cardKey: '',
  linkDescription: '',
};

export function LinkForm({
  cards,
  linkTypes,
  onSubmit,
  cardKey,
  currentCardLinks,
  data,
  state,
  inModal = false,
  formRef,
  onCancel,
  isLoading,
  isUpdating,
}: LinkFormProps) {
  const { control, handleSubmit, reset, watch } = useForm<LinkFormData>({
    defaultValues: {
      ...DEFAULT_LINK_FORM_DATA,
      ...(data || {}),
    },
  });
  const { t } = useTranslation();

  useEffect(() => {
    reset({
      ...DEFAULT_LINK_FORM_DATA,
      ...(data || {}),
    });
  }, [data, reset]);

  // find chosen link type
  const linkType = watch('linkType');

  const selectedLinkType = linkTypes.find((t) => t.id === linkType);

  const usableCards = flattenTree(cards).filter(
    createPredicate(
      canCreateLinkToCard,
      cardKey,
      selectedLinkType,
      currentCardLinks,
    ),
  );

  // If card is not in usable cards, reset the form
  const formCardKey = watch('cardKey');
  useEffect(() => {
    if (formCardKey && !usableCards.find((c) => c.key === formCardKey)) {
      reset({
        ...DEFAULT_LINK_FORM_DATA,
        linkType,
      });
    }
  }, [formCardKey, usableCards, linkType, reset]);

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit(async (formData) => {
        const oldLinkType = linkTypes.find((t) => t.id === data?.linkType);
        const linkType = linkTypes.find((t) => t.id === formData.linkType);
        if (!linkType) return;
        const success = await onSubmit?.({
          linkType: linkType.name,
          cardKey: formData.cardKey,
          linkDescription: formData.linkDescription,
          direction: linkType.direction,
          previousLinkType:
            state === 'edit' && data ? linkType.name : undefined,
          previousCardKey: state === 'edit' && data ? data.cardKey : undefined,
          previousLinkDescription:
            state === 'edit' && data ? data.linkDescription : undefined,
          previousDirection:
            state === 'edit' && oldLinkType ? oldLinkType.direction : undefined,
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
                {linkTypes.map((linkType) => (
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
                  label: `${c.title} (${c.key})`,
                  value: c.key,
                }))}
                isOptionEqualToValue={(option, value) =>
                  option.value === value.value
                }
                onChange={(_, value) => onChange(value?.value || '')}
                value={
                  value
                    ? {
                        label: `${findCard(cards, value)?.title}(${value})`,
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

        {/* Only render the button if not in modal mode */}
        {!inModal && (
          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Button
              variant="plain"
              onClick={onCancel}
              sx={{
                width: '100px',
              }}
              disabled={isLoading}
            >
              {t('cancel')}
            </Button>
            <Button
              type="submit"
              sx={{
                width: '100px',
              }}
              loading={isUpdating}
              disabled={isLoading}
            >
              {data ? t('linkForm.buttonEdit') : t('linkForm.button')}
            </Button>
          </Stack>
        )}
      </Stack>
    </form>
  );
}

const Notifications = ({
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

const PolicyChecks = ({
  policyChecks,
  cardKey,
}: {
  policyChecks: PolicyCheckCollection;
  cardKey: string;
}) => {
  const { t } = useTranslation();

  // Convert PolicyCheckCollection to CheckCollection format
  const checksData: CheckCollection = {
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

export const ContentArea: React.FC<ContentAreaProps> = ({
  card,
  cards,
  linkTypes,
  onMetadataClick,
  onLinkFormSubmit,
  preview,
  linkFormState,
  onLinkFormChange,
  onDeleteLink,
}) => {
  const { isUpdating } = useCard(card.key);
  const [visibleHeaderIds, setVisibleHeaderIds] = useState<string[] | null>(
    null,
  );
  const [linksExpanded, setLinksExpanded] = useState(false);

  const { modalOpen, openModal, closeModal } = useModals({
    editLink: false,
    deleteLink: false,
  });

  const [deleteLinkData, setDeleteLinkData] = useState<CalculationLink | null>(
    null,
  );

  const boxRef = useRef<HTMLDivElement>(null);
  const linkedCardsRef = useRef<HTMLDivElement>(null);

  const [contentRef, setContentRef] = useState<HTMLDivElement | null>(null);

  const dispatch = useAppDispatch();

  const { t } = useTranslation();

  const lastTitle = useAppSelector((state) => state.page.title);
  const cardKey = useAppSelector((state) => state.page.cardKey);

  const [editLinkData, setEditLinkData] = useState<
    LinkFormData & {
      linkTypeName: string;
      direction: LinkDirection;
    }
  >();

  useEffect(() => {
    if (
      (linkFormState === 'add' || linkFormState === 'add-from-toolbar') &&
      !linksExpanded
    ) {
      setLinksExpanded(true);
    }
  }, [linkFormState, linksExpanded]);

  useEffect(() => {
    if (linkFormState !== 'edit') {
      setEditLinkData(undefined);
    }
  }, [linkFormState]);

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

  const [modalSvg, setModalSvg] = useState<string>('');
  const [isModalOpen, setModalOpen] = useState(false);

  const fullScreenIcon = renderToStaticMarkup(<OpenInFullIcon />);
  const downloadIcon = renderToStaticMarkup(<DownloadIcon />);

  const makeIconButton = (icon: string, aria: string) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('aria-label', aria);
    Object.assign(btn.style, {
      border: 'none',
      background: 'transparent',
      cursor: 'pointer',
      padding: '4px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    } as CSSStyleDeclaration);
    btn.innerHTML = icon;
    return btn;
  };

  const handleFullScreen = (htmlElementWithSVG: HTMLElement) => {
    const svgEl = htmlElementWithSVG.querySelector<SVGSVGElement>('svg');
    if (!svgEl) return;

    const xml = new XMLSerializer().serializeToString(svgEl);
    const svgWithNs = xml.match(/^<svg[^>]+xmlns=/)
      ? xml
      : xml.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');

    setModalSvg(svgWithNs);
    setModalOpen(true);
  };

  const handleDownload = (htmlElementWithSVG: HTMLElement) => {
    const svgEl = htmlElementWithSVG.querySelector<SVGSVGElement>('svg');
    if (!svgEl) return;

    const serializer = new XMLSerializer();
    let source = serializer.serializeToString(svgEl);
    if (!source.match(/^<svg[^>]+xmlns=/)) {
      source = source.replace(
        /^<svg/,
        '<svg xmlns="http://www.w3.org/2000/svg"',
      );
    }

    const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = (svgEl.id || card.title) + ' diagram.svg';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    if (!contentRef) return;

    const wrappers: NodeListOf<HTMLElement> =
      contentRef.querySelectorAll<HTMLElement>(
        '[data-type="cyberismo-svg-wrapper"]',
      );

    wrappers.forEach((wrapper) => {
      if (wrapper.querySelector('[data-cy="svg-controls"]')) return;

      if (wrapper.style.paddingTop === '') wrapper.style.paddingTop = '48px';
      if (wrapper.style.position === '') wrapper.style.position = 'relative';

      const controls = document.createElement('div');
      controls.setAttribute('data-cy', 'svg-controls');
      Object.assign(controls.style, {
        position: 'absolute',
        top: '8px',
        right: '8px',
        display: 'flex',
        gap: '6px',
        zIndex: 10,
      } as unknown as CSSStyleDeclaration);

      /* ---------- Buttons ---------- */
      const fullScreenBtn = makeIconButton(fullScreenIcon, 'fullscreen');
      const downloadBtn = makeIconButton(downloadIcon, 'download');

      const handleFullScreenClick = () => handleFullScreen(wrapper);
      const handleDownloadClick = () => handleDownload(wrapper);

      fullScreenBtn.addEventListener('click', handleFullScreenClick);
      downloadBtn.addEventListener('click', handleDownloadClick);

      controls.appendChild(fullScreenBtn);
      controls.appendChild(downloadBtn);
      wrapper.appendChild(controls);

      /* ---------- Cleanup for this wrapper ---------- */
      const cleanup = () => {
        fullScreenBtn.removeEventListener('click', handleFullScreenClick);
        downloadBtn.removeEventListener('click', handleDownloadClick);
        wrapper.querySelector('[data-cy="svg-controls"]')?.remove();
      };
      (wrapper as HTMLElementWithCleanup).__cleanupSvgControls = cleanup;
    });

    /* ---------- Global cleanup on effect teardown ---------- */
    return () => {
      wrappers.forEach((wrapper) => {
        (wrapper as HTMLElementWithCleanup).__cleanupSvgControls?.();
        delete (wrapper as HTMLElementWithCleanup).__cleanupSvgControls;
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentRef, useLocation().key]);

  const setRef = useCallback((node: HTMLDivElement | null) => {
    setContentRef(node);
  }, []);

  const htmlContent = card.parsedContent || '';

  const combinedMacros = Object.entries(macroMetadata).reduce<
    // We simply trust that the macro has been validated
    // If a validation error occurs, it should also not try to render
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (MacroMetadata & { component: (props: any) => ReactElement })[]
  >((acc, [key, value]) => {
    acc.push({
      ...value,
      component: UImacros[key as UIMacroName] ?? (() => <>err</>),
    });
    return acc;
  }, []);

  // NOTE: Parser is case-insensitive and lower cases all tags and attributes
  // htmlparser2 options cannot be used on the browser
  const parsedContent = parseReact(htmlContent, {
    replace: (node) => {
      if (node.type === 'tag') {
        const macro = combinedMacros.find((m) => m.tagName === node.name);
        if (macro) {
          const attributes = parseDataAttributes(node.attribs);
          return React.createElement(macro.component, {
            ...attributes,
            macroKey: card.key,
            preview,
          });
        }
      }
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

  // Function to scroll to linked cards section
  const scrollToLinkedCards = () => {
    if (linkedCardsRef.current) {
      linkedCardsRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Effect to scroll to linked cards when link form is opened from toolbar
  useEffect(() => {
    if (linkFormState === 'add-from-toolbar') {
      scrollToLinkedCards();
    }
  }, [linkFormState]);

  return (
    <Stack direction="row" height="100%">
      <SvgViewerModal
        open={isModalOpen}
        svgMarkup={modalSvg}
        onClose={() => setModalOpen(false)}
      />
      <Box
        width="100%"
        padding={3}
        flexGrow={1}
        sx={{
          overflowY: 'scroll',
          scrollbarWidth: 'thin',
        }}
        onScroll={handleScroll}
        ref={boxRef}
      >
        <Stack spacing={3} height="100%">
          <Typography level="h1">{card.title}</Typography>
          <MetadataView
            editMode={false}
            initialExpanded={false}
            onClick={onMetadataClick}
            card={card}
          />
          {(card.links.length > 0 || linkFormState !== 'hidden') && (
            <Accordion
              expanded={linksExpanded}
              ref={linkedCardsRef}
              sx={{
                width: '100%',
              }}
            >
              <Stack direction="row" width="100%">
                <AccordionSummary
                  indicator={<ExpandMore data-cy="expandLinks" />}
                  onClick={() => {
                    if (linksExpanded) {
                      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
                      onLinkFormChange && onLinkFormChange('hidden');
                    }
                    setLinksExpanded(!linksExpanded);
                  }}
                  sx={{
                    borderRadius: '4px',
                    marginTop: 1,
                    marginBottom: 1,
                    flexGrow: 1,
                    height: 36,
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
                    {card.links.length}
                  </Typography>
                  <Stack
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                    sx={{ width: '100%' }}
                  >
                    <Typography level="title-sm" fontWeight="bold">
                      {t('linkedCards')}
                    </Typography>
                  </Stack>
                </AccordionSummary>
                {!preview &&
                  linkFormState === 'hidden' &&
                  !config.staticMode && (
                    <IconButton
                      sx={{
                        height: 36,
                        alignSelf: 'center',
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
                        onLinkFormChange && onLinkFormChange('add');
                      }}
                    >
                      <Add />
                    </IconButton>
                  )}
              </Stack>
              <AccordionDetails>
                {!preview &&
                  linkFormState !== 'hidden' &&
                  linkFormState !== 'edit' && (
                    <Box p={2}>
                      <LinkForm
                        cards={cards}
                        linkTypes={linkTypes}
                        onSubmit={onLinkFormSubmit}
                        cardKey={card.key}
                        currentCardLinks={card.links}
                        state={linkFormState}
                        onCancel={() =>
                          onLinkFormChange && onLinkFormChange('hidden')
                        }
                        isLoading={isUpdating()}
                        isUpdating={isUpdating('createLink')}
                      />
                    </Box>
                  )}
                {card.links.length > 0 && (
                  <Stack
                    bgcolor="neutral.softBg"
                    borderRadius={16}
                    paddingY={2}
                    paddingX={2}
                    spacing={2}
                  >
                    {card.links.map((link, index) => (
                      <Stack
                        key={index}
                        borderRadius={16}
                        paddingLeft={2}
                        direction="row"
                        justifyContent="space-between"
                        alignItems="center"
                        sx={{
                          '&:hover .actionButton': {
                            opacity: 1,
                          },
                          '& .actionButton': {
                            opacity: 0,
                            transition: 'opacity 0.2s',
                          },
                        }}
                      >
                        <Stack>
                          <Typography data-cy="cardLinkType" level="body-sm">
                            {link.displayName}
                          </Typography>
                          <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            <RouterLink
                              data-cy="cardLink"
                              to={`/cards/${link.key}`}
                            >
                              <Link component="div">{link.key}</Link>
                            </RouterLink>
                            <Divider
                              orientation="vertical"
                              sx={{
                                marginX: '4px',
                              }}
                            />
                            <Typography
                              data-cy="cardLinkTitle"
                              level="title-sm"
                            >
                              {link.title}
                            </Typography>
                            {link.linkDescription && (
                              <Typography level="body-sm" marginLeft={2}>
                                {link.linkDescription}
                              </Typography>
                            )}
                          </Box>
                        </Stack>
                        {link.linkSource === 'user' && !preview && (
                          <Box
                            gap={1}
                            fontSize={24}
                            alignItems="center"
                            marginRight={2}
                          >
                            <IconButton
                              className="actionButton"
                              onClick={() => {
                                const linkType = linkTypes.find(
                                  (t) =>
                                    t.name === link.linkType &&
                                    t.direction === link.direction,
                                );
                                setEditLinkData({
                                  linkType: linkType?.id ?? NO_LINK_TYPE,
                                  cardKey: link.key,
                                  linkDescription: link.linkDescription || '',
                                  linkTypeName: link.linkType,
                                  direction: link.direction,
                                });
                                openModal('editLink')();
                              }}
                            >
                              <Edit fontSize="inherit" />
                            </IconButton>
                            <IconButton
                              className="actionButton"
                              onClick={() => {
                                setDeleteLinkData(link);
                                openModal('deleteLink')();
                              }}
                            >
                              <Delete fontSize="inherit" data-cy="DeleteIcon" />
                            </IconButton>
                          </Box>
                        )}
                        {link.linkSource === 'calculated' && (
                          <IconButton color="primary">
                            <Tooltip title={t('linkForm.calculatedLink')}>
                              <Info fontSize="small" />
                            </Tooltip>
                          </IconButton>
                        )}
                      </Stack>
                    ))}
                  </Stack>
                )}
              </AccordionDetails>
            </Accordion>
          )}
          <Box pl={4} pr={4} mt={0}>
            <div className="doc" ref={setRef}>
              {parsedContent}
            </div>
          </Box>
        </Stack>
      </Box>
      <Stack
        m={2}
        flexGrow={1}
        sx={{
          overflowY: 'auto',
          scrollbarWidth: 'thin',
        }}
        data-cy="cardSidebar"
      >
        <Box sx={{ marginBottom: 1 }}>
          {renderTableOfContents(
            t('tableOfContents'),
            htmlContent,
            visibleHeaderIds,
          )}
        </Box>
        <Notifications notifications={card.notifications} />
        <PolicyChecks policyChecks={card.policyChecks} cardKey={card.key} />
      </Stack>

      {/* Modals */}
      {!preview && (
        <>
          <EditLinkModal
            open={modalOpen.editLink}
            onClose={() => {
              closeModal('editLink')();
              setEditLinkData(undefined);
            }}
            onSubmit={async (data) => {
              if (onLinkFormSubmit) {
                return await onLinkFormSubmit(data);
              }
              return false;
            }}
            editLinkData={editLinkData}
            cards={cards}
            linkTypes={linkTypes}
            cardKey={card.key}
          />
          <GenericConfirmModal
            open={modalOpen.deleteLink}
            onClose={closeModal('deleteLink')}
            onConfirm={async () => {
              if (deleteLinkData) {
                await onDeleteLink?.(deleteLinkData);
              }
              closeModal('deleteLink')();
            }}
            title={t('deleteLink')}
            content={t('deleteLinkConfirm')}
            confirmText={t('delete')}
          />
        </>
      )}
    </Stack>
  );
};

function renderTableOfContents(
  title: string,
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
      <div className="toc-menu" style={{ marginLeft: 2 }}>
        {headers.length > 0 && (
          <Typography level="title-sm" fontWeight="bold">
            {title}
          </Typography>
        )}
        <ul>
          {headers.map(
            (
              header: { id: string; text: string; level: number },
              index: number,
            ) => (
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
            ),
          )}
        </ul>
      </div>
    </aside>
  );
}
