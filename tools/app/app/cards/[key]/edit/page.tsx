/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

'use client';
import React, { useCallback, useEffect, useState, use } from 'react';
import { CardDetails, CardMode, MetadataValue } from '@/app/lib/definitions';

import {
  Box,
  Tab,
  Tabs,
  TabPanel,
  TabList,
  Stack,
  Textarea,
  Typography,
  Card,
  CardContent,
  CardOverflow,
  AspectRatio,
  Grid,
  IconButton,
  Link,
  Tooltip,
} from '@mui/joy';

import { useCodeMirror } from '@uiw/react-codemirror';
import { StreamLanguage } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { asciidoc } from 'codemirror-asciidoc';

import ContentToolbar from '@/app/components/ContentToolbar';
import { useSearchParams } from 'next/navigation';
import { ContentArea } from '@/app/components/ContentArea';
import { useCard, useProject, useLinkTypes } from '@/app/lib/api';
import { useTranslation } from 'react-i18next';
import { Controller, FormProvider, useForm } from 'react-hook-form';

import { useAppDispatch, useAppRouter, useAppSelector } from '@/app/lib/hooks';
import { addNotification } from '@/app/lib/slices/notifications';
import MetadataView from '@/app/components/MetadataView';
import Image from 'next/image';
import {
  AddLink,
  Delete,
  Download,
  Edit,
  InsertDriveFile,
} from '@mui/icons-material';
import {
  addAttachment,
  findCurrentTitleFromADoc,
  findSection,
} from '@/app/lib/codemirror';
import { apiPaths } from '@/app/lib/swr';
import { useAttachments } from '@/app/lib/api/attachments';
import { isEdited, viewChanged } from '@/app/lib/slices/pageState';
import LoadingGate from '@/app/components/LoadingGate';
import { openAttachment } from '@/app/lib/api/actions';

import AsciiDoctor from '@asciidoctor/core';
import { expandLinkTypes, useModals } from '@/app/lib/utils';
import { AddAttachmentModal } from '@/app/components/modals';
import { parseContent } from '@/app/lib/api/actions/card';

const asciiDoctor = AsciiDoctor();

const extensions = [StreamLanguage.define(asciidoc), EditorView.lineWrapping];

function AttachmentPreviewCard({
  name,
  children,
  cardKey,
  onInsert,
}: {
  name: string;
  children?: React.ReactNode;
  cardKey: string;
  onInsert?: () => void;
}) {
  const { removeAttachment } = useAttachments(cardKey);
  const [isUpdating, setIsUpdating] = React.useState(false);

  const [isHovered, setIsHovered] = React.useState(false);

  const dispatch = useAppDispatch();

  const { t } = useTranslation();

  return (
    <Card
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      sx={{
        width: '100%',
        gap: 0,
        overflow: 'hidden',
      }}
    >
      <CardOverflow>
        <Box
          position="absolute"
          top={isHovered ? 0 : -36}
          right={0}
          zIndex={1}
          sx={{
            transition: 'top 0.3s',
          }}
        >
          <Tooltip title={t('delete')}>
            <IconButton
              color="danger"
              variant="solid"
              loading={isUpdating}
              sx={{ marginRight: '3px' }}
              onClick={async () => {
                const confirmed = confirm(t('confirmDeleteAttachment'));

                if (confirmed) {
                  setIsUpdating(true);
                  await removeAttachment(name);
                  setIsUpdating(false);
                }
              }}
            >
              <Delete />
            </IconButton>
          </Tooltip>
          <Tooltip title={t('saveCopy')}>
            <IconButton
              variant="solid"
              color="primary"
              sx={{ marginRight: '3px' }}
            >
              <Link
                endDecorator={<Download />}
                href={apiPaths.attachment(cardKey, name)}
                download
                variant="solid"
              />
            </IconButton>
          </Tooltip>
          <Tooltip title={t('openInEditor')}>
            <IconButton
              variant="solid"
              color="primary"
              sx={{ marginRight: '3px' }}
              onClick={async (e) => {
                e.stopPropagation();
                try {
                  await openAttachment(cardKey, name);
                } catch (error) {
                  dispatch(
                    addNotification({
                      message: error instanceof Error ? error.message : '',
                      type: 'error',
                    }),
                  );
                }
              }}
            >
              <Edit />
            </IconButton>
          </Tooltip>
          <Tooltip title={t('insertToContent')}>
            <IconButton
              data-cy="insertToContentButton"
              variant="solid"
              color="primary"
              sx={{ marginRight: '2px' }}
              onClick={() => onInsert && onInsert()}
            >
              <AddLink />
            </IconButton>
          </Tooltip>
        </Box>
        <AspectRatio
          ratio="1"
          maxHeight={97}
          variant="plain"
          objectFit="contain"
        >
          {children}
        </AspectRatio>
      </CardOverflow>
      <CardOverflow
        variant="soft"
        sx={{
          bgcolor: 'neutral.softBg',
        }}
      >
        <CardContent>
          <Typography level="body-xs" noWrap>
            {name}
          </Typography>
        </CardContent>
      </CardOverflow>
    </Card>
  );
}

export default function Page(props: { params: Promise<{ key: string }> }) {
  const params = use(props.params);
  const { t } = useTranslation();

  const { modalOpen, openModal, closeModal } = useModals({
    delete: false,
    move: false,
    metadata: false,
    addAttachment: false,
  });

  const {
    project,
    isLoading: isLoadingProject,
    error: errorProject,
  } = useProject();

  const {
    card,
    updateCard,
    isLoading: isLoadingCard,
    error: errorCard,
  } = useCard(params.key);

  const {
    linkTypes,
    isLoading: isLoadingLinkTypes,
    error: errorLinkTypes,
  } = useLinkTypes();

  const searchParams = useSearchParams();

  const dispatch = useAppDispatch();

  const router = useAppRouter();

  const [editor, setEditor] = useState<HTMLDivElement | null>(null);

  const [content, setContent] = useState<string>();

  const { setContainer, view, state } = useCodeMirror({
    extensions,
    value: content,
    basicSetup: {
      lineNumbers: false,
    },
    style: {
      border: '1px solid',
      borderColor: 'rgba(0,0,0,0.23)',
      borderRadius: 4,
    },
  });

  const [tab, setTab] = React.useState(0);

  const getContent = () => {
    return view?.state.doc.toString() || '';
  };
  useEffect(() => {
    setContent(getContent());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    if (editor) {
      setContainer(editor);
    }
  }, [editor, setContainer]);

  const formMethods = useForm();

  const { handleSubmit, control, watch } = formMethods;

  const preview = watch();

  const [hasUnsavedChanges, setHasUnsavedChanges] = React.useState(false);

  const { __title__, ...metadata } = preview;

  // Here we assume that metadata contains valid metadata values

  const [parsed, setParsed] = useState<string>('');

  useEffect(() => {
    setContent(card?.content || '');
  }, [card]);

  useEffect(() => {
    const content = getContent();
    if (!content) {
      return;
    }
    setParsed('');
    let mounted = true;
    async function parse() {
      const res = await parseContent(params.key, content);
      if (mounted) {
        setParsed(res);
      }
    }
    parse();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const previewCard = card
    ? ({
        ...card,
        metadata: {
          ...card.metadata,
          title: __title__ ?? card.metadata?.title,
          ...metadata,
        },
        content: getContent() ?? card.content,
        parsed,
      } as CardDetails & {
        parsed: string;
      })
    : null;

  useEffect(() => {
    if (!card || Object.keys(preview).length === 0) {
      return;
    }
    const { __title__, ...metadata } = preview;

    const content = getContent();

    if (
      content === card.content &&
      __title__ === card.metadata?.title &&
      Object.keys(metadata).every(
        (key) => card?.metadata?.[key] === metadata[key],
      )
    ) {
      setHasUnsavedChanges(false);
      return;
    }
    setHasUnsavedChanges(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview, card, setHasUnsavedChanges]);

  useEffect(() => {
    dispatch(isEdited(hasUnsavedChanges));
  }, [dispatch, hasUnsavedChanges]);

  useEffect(() => {
    return () => {
      dispatch(isEdited(false));
    };
  }, [dispatch]);

  const lastTitle = useAppSelector((state) => state.page.title);
  const cardKey = useAppSelector((state) => state.page.cardKey);

  // Scroll to the last title when the tab is switched
  useEffect(() => {
    if (!lastTitle || !editor || !view || !state || cardKey !== params.key)
      return;

    let lineNum: number | null = null;

    const doc = asciiDoctor.load(card?.content || '');

    const section = findSection(doc, lastTitle);
    if (!section) return;

    const lines = state.doc.lines;

    for (let i = 1; i < lines + 1; i++) {
      const line = state.doc.line(i);

      const title = section.getTitle();

      if (!title) continue;
      if (line.text.includes(title)) {
        lineNum = line.number;
        break;
      }
    }
    if (!lineNum) return;

    const pos = state.doc.line(lineNum).from;

    view.dispatch({
      effects: EditorView.scrollIntoView(pos, {
        y: 'start',
      }),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card, editor, view]);

  // save the last title when user scrolls
  const handleScroll = () => {
    if (!view || !editor) return;

    const doc = asciiDoctor.load(getContent());

    const title = findCurrentTitleFromADoc(view, editor, doc);

    // making sure the title actually changed to not spam redux
    if (!title || (title === lastTitle && cardKey === params.key)) {
      return;
    }

    dispatch(
      viewChanged({
        title,
        cardKey: params.key,
      }),
    );
  };

  const setRef = useCallback((ref: HTMLDivElement) => {
    setEditor(ref);
  }, []);

  // For now, simply show loading if any of the data is loading
  if (isLoadingCard || isLoadingProject || isLoadingLinkTypes) {
    return <Box>{t('loading')}</Box>;
  }
  // If any of the data is missing, just show a message that the card was not found
  if (!card || !card.metadata || !previewCard || !project || !linkTypes) {
    return (
      <Box>
        {t('failedToLoad')}
        {': '}
        {[errorCard, errorProject, errorLinkTypes]
          .map((error) => (error instanceof Error ? error.message : ''))
          .filter(Boolean)
          .join(', ')}
      </Box>
    );
  }

  const handleSave = async (data: Record<string, MetadataValue>) => {
    try {
      const { __title__, ...metadata } = data;
      const update: Record<string, MetadataValue> = metadata;

      await updateCard({
        content: getContent(),
        metadata: {
          ...update,
          title: __title__,
        },
      });
      dispatch(
        addNotification({
          message: t('saveCard.success'),
          type: 'success',
        }),
      );
      dispatch(isEdited(false));
      router.push(`/cards/${card!.key}`);
    } catch (error) {
      dispatch(
        addNotification({
          message: error instanceof Error ? error.message : '',
          type: 'error',
        }),
      );
    }
  };

  const handleDragDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();

    const { items } = event.dataTransfer;
    if (items.length === 0) return;
    if (items[0].kind !== 'string' && items[0].type !== 'text/uri-list') return;
    items[0].getAsString((uri) => {
      let decodedURI;
      try {
        decodedURI = decodeURI(uri);
      } catch (e) {
        console.log(e);
        return;
      }

      // Find attachment with same filename and add link to editor
      const attachment = card?.attachments?.find((attachment) =>
        decodedURI.includes(attachment.fileName),
      );
      if (attachment && view && card && editor) {
        // Move editor cursor to drop point
        editor.focus();
        const dropPosition =
          view.posAtCoords({
            x: event.pageX,
            y: event.pageY,
          }) ?? 0;
        view.dispatch({
          selection: { anchor: dropPosition, head: dropPosition },
        });

        addAttachment(view, attachment, card.key);
      }
    });
  };

  const expandedLinkTypes =
    linkTypes && card?.metadata?.cardType
      ? expandLinkTypes(linkTypes, card?.metadata?.cardType || '')
      : [];

  return (
    <>
      <Stack height="100%">
        <FormProvider {...formMethods}>
          <ContentToolbar
            cardKey={params.key}
            mode={CardMode.EDIT}
            onUpdate={() => handleSubmit(handleSave)()}
            linkButtonDisabled={true}
          />
          <Stack flexGrow={1} minHeight={0} padding={3} paddingRight={0}>
            <Tabs
              value={tab}
              onChange={(e, newValue) =>
                typeof newValue === 'number' && setTab(newValue)
              }
              sx={{
                height: '100%',
              }}
            >
              <TabList
                sx={{
                  justifyContent: 'right',
                  width: '70%',
                }}
              >
                <Tab data-cy="editTab">{t('edit')}</Tab>
                <Tab data-cy="previewTab">{t('preview')}</Tab>
              </TabList>
              <TabPanel
                value={0}
                sx={{
                  height: '100%',
                }}
              >
                <Stack direction="row" height="100%">
                  <Box
                    height="100%"
                    sx={{
                      overflowY: 'scroll',
                      scrollbarWidth: 'thin',
                    }}
                    width="70%"
                    paddingRight={3}
                    onScroll={handleScroll}
                  >
                    <Controller
                      name="__title__"
                      control={control}
                      defaultValue={card.metadata.title}
                      render={({ field: { value, onChange } }: any) => (
                        <Textarea
                          sx={{
                            marginBottom: '10px',
                            fontWeight: 'bold',
                            fontSize: '1.8rem',
                          }}
                          value={value}
                          onChange={onChange}
                        />
                      )}
                    />
                    <Box marginBottom={1.2}>
                      <MetadataView
                        initialExpanded={searchParams.get('expand') === 'true'}
                        editMode={true}
                        metadata={card?.metadata}
                        cardKey={params.key}
                      />
                    </Box>
                    <div ref={setRef} onDrop={handleDragDrop} />
                  </Box>
                  <Box
                    flexGrow={1}
                    display="flex"
                    flexDirection="column"
                    padding={2}
                    sx={{
                      scrollbarWidth: 'thin',
                      overflowY: 'scroll',
                    }}
                    alignItems="flex-start"
                    width="30%"
                  >
                    <Stack
                      direction="row"
                      padding={4}
                      paddingTop={0}
                      alignItems="center"
                    >
                      <Typography
                        level="body-xs"
                        color="warning"
                        variant="soft"
                        width={24}
                        height={24}
                        alignContent="center"
                        borderRadius={40}
                        paddingX={1.1}
                      >
                        {card?.attachments?.length || 0}
                      </Typography>
                      <Typography level="body-xs" marginLeft={1.5}>
                        {(card?.attachments?.length || 0) === 1
                          ? t('attachment')
                          : t('attachments')}
                      </Typography>
                      <Tooltip title={t('addAttachment')}>
                        <IconButton onClick={openModal('addAttachment')}>
                          <Image
                            alt="Add attachment"
                            width={24}
                            height={24}
                            src="/static/images/attach_file_add.svg"
                          />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                    <Grid container gap={2} paddingLeft={3}>
                      {card?.attachments?.map((attachment) => (
                        <Grid
                          key={attachment.fileName}
                          display="flex"
                          justifyContent="center"
                          width={160}
                        >
                          <AttachmentPreviewCard
                            name={attachment.fileName}
                            cardKey={params.key}
                            onInsert={() => {
                              if (view && card) {
                                addAttachment(view, attachment, card.key);
                              }
                            }}
                          >
                            {attachment.mimeType?.startsWith('image') ? (
                              <Image
                                src={apiPaths.attachment(
                                  card.key,
                                  attachment.fileName,
                                )}
                                alt=""
                                fill
                              />
                            ) : (
                              <InsertDriveFile />
                            )}
                          </AttachmentPreviewCard>
                        </Grid>
                      ))}
                    </Grid>
                  </Box>
                </Stack>
              </TabPanel>
              <TabPanel
                value={1}
                sx={{
                  height: '100%',
                }}
              >
                <Box height="100%">
                  <LoadingGate values={[linkTypes, previewCard.parsed || null]}>
                    <ContentArea
                      card={previewCard}
                      linkTypes={expandedLinkTypes}
                      project={project}
                      preview={true}
                      cardQuery={{
                        key: '',
                        title: '', // for now we can just provide an empty result for the preview,
                        rank: '',
                        workflowState: '',
                        lastUpdated: '',
                        labels: [],
                        links: [],
                        deniedOperations: {
                          transition: [],
                          move: [],
                          editContent: [],
                          editField: [],
                          delete: [],
                        },
                        notifications: [],
                        policyChecks: {
                          successes: [],
                          failures: [],
                        },
                        results: [],
                      }}
                    />
                  </LoadingGate>
                </Box>
              </TabPanel>
            </Tabs>
          </Stack>
        </FormProvider>
      </Stack>
      <AddAttachmentModal
        open={modalOpen.addAttachment}
        onClose={closeModal('addAttachment')}
        cardKey={card.key}
      />
    </>
  );
}
