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
import {
  CardDetails,
  ExpandedLinkType,
  ParsedLink,
  Project,
} from '../lib/definitions';

import { parse } from 'node-html-parser';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Autocomplete,
  Box,
  Button,
  ChipDelete,
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
import MetadataView from './MetadataView';
import { findCard, flattenTree, useModals } from '../lib/utils';
import { default as NextLink } from 'next/link';
import {
  Add,
  Delete,
  Edit,
  ExpandMore,
  Search,
  Info,
} from '@mui/icons-material';
import { Controller, useForm } from 'react-hook-form';
import EditLinkModal from './modals/EditLinkModal';

import { useAppDispatch, useAppSelector } from '../lib/hooks';
import { viewChanged } from '../lib/slices/pageState';

import { MacroMetadata } from '@cyberismocom/data-handler/interfaces/macros';
import { macroMetadata } from '@cyberismocom/data-handler/macros/common';
import { UIMacroName, macros as UImacros } from './macros';
import parseReact from 'html-react-parser';
import {
  PolicyCheckCollection,
  Notification,
  QueryResult,
  CalculationLink,
  LinkDirection,
} from '@cyberismocom/data-handler/types/queries';
import { CardResponse } from '../lib/api/types';

export type LinkFormState = 'hidden' | 'add' | 'edit';

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
  cardKey: string;
  state: LinkFormState;
  data?: LinkFormData;
  inModal?: boolean;
  formRef?: React.RefObject<HTMLFormElement>;
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
  data,
  state,
  inModal = false,
  formRef,
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

  const usableCards = flattenTree(cards).filter((card) => {
    if (!selectedLinkType || card.key === cardKey) return false;
    if (selectedLinkType.direction === 'outbound') {
      return (
        selectedLinkType.destinationCardTypes.includes(card.cardType) ||
        selectedLinkType.destinationCardTypes.length === 0
      );
    } else {
      return (
        selectedLinkType.sourceCardTypes.includes(card.cardType || '') ||
        selectedLinkType.sourceCardTypes.length === 0
      );
    }
  });

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
          <Button
            type="submit"
            sx={{
              width: '100px',
              alignSelf: 'flex-end',
            }}
          >
            {data ? t('linkForm.buttonEdit') : t('linkForm.button')}
          </Button>
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
}: {
  policyChecks: PolicyCheckCollection;
}) => {
  const { t } = useTranslation();
  const [successesExpanded, setSuccessesExpanded] = useState(false);
  const [failuresExpanded, setFailuresExpanded] = useState(true);

  if (
    policyChecks.successes.length === 0 &&
    policyChecks.failures.length === 0
  ) {
    return null;
  }
  return (
    <Box sx={{ marginTop: 2, maxWidth: 400 }}>
      {policyChecks.successes.length > 0 && (
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
                {policyChecks.successes.length}
              </Typography>
              <Typography
                level="title-sm"
                fontWeight="bold"
                sx={{ width: '100%' }}
              >
                {t('passedPolicyChecks')}
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Stack spacing={1}>
                {policyChecks.successes.map((success, index) => (
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
                      {t('policyCheckPass')}
                    </Typography>
                  </Alert>
                ))}
              </Stack>
            </AccordionDetails>
          </Accordion>
        </Box>
      )}

      {policyChecks.failures.length > 0 && (
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
                {policyChecks.failures.length}
              </Typography>
              <Typography
                level="title-sm"
                fontWeight="bold"
                sx={{ width: '100%' }}
              >
                {t('failedPolicyChecks')}
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Stack spacing={1}>
                {policyChecks.failures.map((failure, index) => (
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
                        {failure.category} - {failure.title}
                      </Typography>
                      <Typography fontSize="xs">
                        {failure.errorMessage}
                      </Typography>
                    </Box>
                    <Typography level="title-sm" fontWeight="bold">
                      {t('policyCheckFail')}
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
}) => {
  const [visibleHeaderIds, setVisibleHeaderIds] = useState<string[] | null>(
    null,
  );

  const { modalOpen, openModal, closeModal } = useModals({
    editLink: false,
  });

  const [deleteLinkData, setDeleteLinkData] = useState<CalculationLink | null>(
    null,
  );

  const boxRef = React.createRef<HTMLDivElement>();

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

  const setRef = useCallback((node: HTMLDivElement | null) => {
    setContentRef(node);
  }, []);

  const htmlContent = card.parsedContent || '';

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
          return React.createElement(macro.component, {
            ...node.attribs, // node attribs should contain the key
            macroKey: card.key,
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
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="center"
            >
              <Typography level="title-sm">{t('linkedCards')}</Typography>
              {!preview &&
                (linkFormState !== 'hidden' ? (
                  <ChipDelete
                    onDelete={() =>
                      onLinkFormChange && onLinkFormChange('hidden')
                    }
                  />
                ) : (
                  <IconButton
                    onClick={() => onLinkFormChange && onLinkFormChange('add')}
                  >
                    <Add />
                  </IconButton>
                ))}
            </Stack>
          )}
          {!preview &&
            linkFormState !== 'hidden' &&
            linkFormState !== 'edit' && (
              <LinkForm
                cards={cards}
                linkTypes={linkTypes}
                onSubmit={onLinkFormSubmit}
                cardKey={card.key}
                state={linkFormState}
              />
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
                      <NextLink data-cy="cardLink" href={`/cards/${link.key}`}>
                        <Link component="div">{link.key}</Link>
                      </NextLink>
                      <Divider
                        orientation="vertical"
                        sx={{
                          marginX: '4px',
                        }}
                      />
                      <Typography data-cy="cardLinkTitle" level="title-sm">
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
                        }}
                      >
                        <Delete fontSize="inherit" />
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
      >
        <Box sx={{ marginBottom: 1 }}>
          {renderTableOfContents(
            t('tableOfContents'),
            htmlContent,
            visibleHeaderIds,
          )}
        </Box>
        <Notifications notifications={card.notifications} />
        <PolicyChecks policyChecks={card.policyChecks} />
      </Stack>

      {/* Modals */}
      {!preview && (
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
