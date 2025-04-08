/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import React, { useCallback, useEffect, useState } from 'react';
import { CardMode, MetadataValue } from '@/lib/definitions';

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

import CodeMirror, { EditorState } from '@uiw/react-codemirror';
import { StreamLanguage } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { asciidoc } from 'codemirror-asciidoc';

import ContentToolbar from '@/components/ContentToolbar';
import { useSearchParams } from 'react-router';
import { ContentArea } from '@/components/ContentArea';
import { useCard, useLinkTypes, useTree } from '@/lib/api';
import { useTranslation } from 'react-i18next';
import { Controller, FormProvider, useForm } from 'react-hook-form';

import {
  useAppDispatch,
  useAppRouter,
  useAppSelector,
  useKeyboardShortcut,
} from '@/lib/hooks';
import { addNotification } from '@/lib/slices/notifications';
import MetadataView from '@/components/MetadataView';

import AddLink from '@mui/icons-material/AddLink';
import Delete from '@mui/icons-material/Delete';
import Download from '@mui/icons-material/Download';
import Edit from '@mui/icons-material/Edit';
import InsertDriveFile from '@mui/icons-material/InsertDriveFile';

import {
  addAttachment,
  findCurrentTitleFromADoc,
  findSection,
} from '@/lib/codemirror';
import { apiPaths } from '@/lib/swr';
import { useAttachments } from '@/lib/api/attachments';
import { isEdited, viewChanged } from '@/lib/slices/pageState';
import LoadingGate from '@/components/LoadingGate';
import { openAttachment } from '@/lib/api/actions';

import AsciiDoctor from '@asciidoctor/core';
import { deepCopy, expandLinkTypes, useModals } from '@/lib/utils';
import { useKeyParam } from '@/lib/hooks';
import { AddAttachmentModal } from '@/components/modals';
import { parseContent } from '@/lib/api/actions/card';

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

export default function Page() {
  const key = useKeyParam();
  const { t } = useTranslation();

  if (!key) {
    return <Box>{t('failedToLoad')}</Box>;
  }

  const { modalOpen, openModal, closeModal } = useModals({
    delete: false,
    move: false,
    metadata: false,
    addAttachment: false,
  });

  const { tree, isLoading: isLoadingTree, error: errorTree } = useTree();

  const {
    card,
    updateCard,
    isLoading: isLoadingCard,
    error: errorCard,
  } = useCard(key);

  const {
    linkTypes,
    isLoading: isLoadingLinkTypes,
    error: errorLinkTypes,
  } = useLinkTypes();

  const [searchParams] = useSearchParams();

  const focusField = searchParams.get('focusField') || undefined;

  const dispatch = useAppDispatch();

  const router = useAppRouter();

  useKeyboardShortcut(
    {
      key: 'escape',
    },
    () => router.safeBack(),
    [router],
  );

  const [editor, setEditor] = useState<HTMLDivElement | null>(null);

  const [content, setContent] = useState<string>(card?.rawContent || '');

  const [tab, setTab] = React.useState(0);

  const [state, setState] = useState<EditorState | null>(null);
  const [view, setView] = useState<EditorView | null>(null);

  const formMethods = useForm();

  const { handleSubmit, control, watch } = formMethods;

  const preview = watch();

  const [hasUnsavedChanges, setHasUnsavedChanges] = React.useState(false);

  const { __title__, ...metadata } = preview;

  // Here we assume that metadata contains valid metadata values

  const [parsed, setParsed] = useState<string | null>(null);

  useEffect(() => {
    setContent(card?.rawContent || '');
  }, [card]);

  useEffect(() => {
    if (!content) {
      return;
    }
    setParsed(null);
    let mounted = true;
    async function parse(content: string) {
      const res = await parseContent(key!, content);
      if (mounted) {
        setParsed(res);
      }
    }
    parse(content);
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const previewCard =
    card && parsed
      ? {
          ...card,
          title: __title__ ?? card.title,
          rawContent: content ?? card.rawContent,
          parsedContent: parsed,
          fields: deepCopy(card.fields) ?? [],
        }
      : null;

  if (previewCard) {
    for (const [key, value] of Object.entries(metadata)) {
      const field = previewCard.fields.find((card) => card.key === key);
      if (field) {
        field.value = value;
      }
    }
  }

  useEffect(() => {
    if (!card || Object.keys(preview).length === 0) {
      return;
    }
    const { __title__, ...metadata } = preview;

    if (
      content === card.rawContent &&
      __title__ === card.title &&
      Object.keys(metadata).every((key) => card?.[key] === metadata[key])
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
    if (!lastTitle || !editor || !view || !state || cardKey !== key) return;

    let lineNum: number | null = null;

    const doc = asciiDoctor.load(card?.rawContent || '');

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

    const doc = asciiDoctor.load(content || '');

    const title = findCurrentTitleFromADoc(view, editor, doc);

    // making sure the title actually changed to not spam redux
    if (!title || (title === lastTitle && cardKey === key)) {
      return;
    }

    dispatch(
      viewChanged({
        title,
        cardKey: key,
      }),
    );
  };

  // ref not provided, let's just use any
  const setRef = useCallback((ref: any) => {
    if (!ref?.view || !ref?.state || !ref?.editor) {
      setView(null);
      setState(null);
      setEditor(null);
      return;
    }
    setView(ref.view);
    setState(ref.state);
    setEditor(ref.editor);
  }, []);

  // For now, simply show loading if any of the data is loading
  if (isLoadingCard || isLoadingTree || isLoadingLinkTypes) {
    return <Box>{t('loading')}</Box>;
  }
  // If any of the data is missing, just show a message that the card was not found
  if (!card || !tree || !linkTypes) {
    return (
      <Box>
        {t('failedToLoad')}
        {': '}
        {[errorCard, errorTree, errorLinkTypes]
          .map((error) => (error instanceof Error ? error.message : ''))
          .filter(Boolean)
          .join(', ')}
      </Box>
    );
  }

  const handleSave = async (data: Record<string, MetadataValue>) => {
    try {
      const { __title__, __labels__, ...metadata } = data;
      const update: {
        content?: string;
        metadata: Record<string, MetadataValue>;
      } = {
        metadata: {},
      };

      for (const key of Object.keys(metadata)) {
        const field = card?.fields?.find((field) => field.key === key);
        if (field && metadata[key] !== field.value && !field.isCalculated) {
          update.metadata[key] = metadata[key];
        }
      }
      if (__title__ !== card.title) {
        update.metadata.title = __title__;
      }

      if (content !== card.rawContent) {
        update.content = content;
      }

      if (JSON.stringify(card.labels) !== JSON.stringify(__labels__)) {
        update.metadata.labels = __labels__;
      }

      await updateCard(update);
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
    linkTypes && card.cardType ? expandLinkTypes(linkTypes, card.cardType) : [];

  return (
    <>
      <Stack height="100%">
        <FormProvider {...formMethods}>
          <ContentToolbar
            cardKey={key}
            mode={CardMode.EDIT}
            onUpdate={() => handleSubmit(handleSave)()}
            linkButtonDisabled={true}
          />
          <Stack flexGrow={1} minHeight={0} padding={3} paddingRight={0}>
            <Tabs
              value={tab}
              onChange={(_, newValue) =>
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
                      defaultValue={card.title}
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
                        card={card}
                        focusField={focusField}
                      />
                    </Box>
                    <CodeMirror
                      ref={setRef}
                      extensions={extensions}
                      value={content}
                      onDrop={handleDragDrop}
                      onChange={(value) => {
                        setContent(value);
                      }}
                      basicSetup={{
                        lineNumbers: false,
                      }}
                      style={{
                        border: '1px solid',
                        borderColor: 'rgba(0,0,0,0.23)',
                        borderRadius: 4,
                      }}
                    />
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
                          <img
                            alt="Add attachment"
                            width={24}
                            height={24}
                            src="/images/attach_file_add.svg"
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
                            cardKey={key}
                            onInsert={() => {
                              if (view && card) {
                                addAttachment(view, attachment, card.key);
                              }
                            }}
                          >
                            {attachment.mimeType?.startsWith('image') ? (
                              <img
                                src={apiPaths.attachment(
                                  card.key,
                                  attachment.fileName,
                                )}
                                alt=""
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
                  <LoadingGate values={[linkTypes, previewCard]}>
                    {/* Note: It is very important that ContentArea is not rendered unless we have gotten the parsed response.
                        LoadingGate ensures that it will show up as loading until previewCard is not null*/}

                    <ContentArea
                      card={previewCard!}
                      linkTypes={expandedLinkTypes}
                      preview={true}
                      cards={tree}
                      linkFormState="hidden"
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
