/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2025
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { MetadataValue } from '@/lib/definitions';

import {
  Box,
  Button,
  Tab,
  Tabs,
  TabPanel,
  TabList,
  Stack,
  Textarea,
} from '@mui/joy';

import type { EditorState, ReactCodeMirrorRef } from '@uiw/react-codemirror';
import CodeMirror from '@uiw/react-codemirror';
import { StreamLanguage } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { asciidoc } from 'codemirror-asciidoc';

import CardToolbar from '@/components/toolbar/CardToolbar';
import { CardLayout } from '@/components/card/CardLayout';
import { AttachmentPanel } from '@/components/card/AttachmentPanel';
import {
  type CardData,
  useCardMutations,
  useLinkTypes,
  useTree,
} from '@/lib/api';
import { useTranslation } from 'react-i18next';
import { Controller, FormProvider, useForm, useWatch } from 'react-hook-form';

import {
  useAppDispatch,
  useAppRouter,
  useAppSelector,
  useIsDarkMode,
  useKeyboardShortcut,
} from '@/lib/hooks';
import { addNotification } from '@/lib/slices/notifications';

import {
  addAttachment,
  findCurrentTitleFromADoc,
  findSection,
  handleAttachmentDrop,
} from '@/lib/codemirror';
import { isEdited, viewChanged } from '@/lib/slices/pageState';
import LoadingGate from '@/components/LoadingGate';

import AsciiDoctor from '@asciidoctor/core';
import { deepCopy, expandLinkTypes, getDefaultValue } from '@/lib/utils';
import { parseContent } from '@/lib/api/actions/card';
import {
  CODE_MIRROR_BASE_PROPS,
  CODE_MIRROR_THEMES,
  TITLE_FIELD_PROPS,
} from '@/lib/constants';
import AsciiDocToolbar from '@/components/AsciiDocToolbar';

const asciiDoctor = AsciiDoctor();

const extensions = [StreamLanguage.define(asciidoc), EditorView.lineWrapping];

export default function CardEditor({
  cardKey,
  afterSave,
  afterDelete,
  cardData,
  readOnly = false,
  onCancel,
}: {
  cardKey: string;
  afterSave?: () => void;
  afterDelete?: () => void;
  cardData: CardData;
  readOnly?: boolean;
  onCancel?: () => void;
}) {
  const { t } = useTranslation();
  const isDarkMode = useIsDarkMode();

  const { tree, isLoading: isLoadingTree, error: errorTree } = useTree();

  const { card, error: errorCard, isLoading: isLoadingCard } = cardData;
  const { updateCard } = useCardMutations(cardKey);

  const {
    linkTypes,
    isLoading: isLoadingLinkTypes,
    error: errorLinkTypes,
  } = useLinkTypes();

  const dispatch = useAppDispatch();

  const router = useAppRouter();

  useKeyboardShortcut(
    {
      key: 'escape',
    },
    () => router.safeBack(),
  );

  const [editor, setEditor] = useState<HTMLDivElement | null>(null);

  const contentRef = useRef(card?.rawContent || '');

  const [tab, setTab] = React.useState(0);

  const [state, setState] = useState<EditorState | null>(null);
  const [view, setView] = useState<EditorView | null>(null);

  const buildDefaultFormValues = useCallback(() => {
    return {
      __title__: card?.title,
      __labels__: card?.labels,
      __createdAt__: card?.createdAt,
      ...card?.fields?.reduce(
        (acc, field) => {
          acc[field.key] = getDefaultValue(field.value);
          return acc;
        },
        {} as Record<string, MetadataValue>,
      ),
    };
  }, [card]);

  const formMethods = useForm<Record<string, MetadataValue>>({
    defaultValues: buildDefaultFormValues(),
  });

  const {
    handleSubmit,
    control,
    formState: { isDirty, isSubmitting },
    getValues,
    reset,
  } = formMethods;
  const preview = useWatch({ control });

  const resetFormToCard = useCallback(() => {
    console.log(card);
    reset(buildDefaultFormValues());
    contentRef.current = card?.rawContent || '';
    dispatch(isEdited(false));
  }, [buildDefaultFormValues, card, dispatch, reset]);

  const handleCancel = () => {
    resetFormToCard();
    onCancel?.();
  };

  const { __title__, __labels__, __createdAt__, ...metadata } = preview;

  // Here we assume that metadata contains valid metadata values

  const [parsed, setParsed] = useState<string | null>(null);

  const isEditedValue = useAppSelector((state) => state.page.isEdited);

  useEffect(() => {
    if (contentRef.current == null) {
      return;
    }
    setParsed(null);
    let mounted = true;
    async function parse(content: string) {
      const res = await parseContent(
        cardKey,
        content || card?.rawContent || '',
      );
      if (mounted) {
        setParsed(res);
      }
    }
    parse(contentRef.current);
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    if (isDirty) {
      dispatch(isEdited(true));
    }
  }, [isDirty, dispatch]);

  useEffect(() => {
    return () => {
      dispatch(isEdited(false));
    };
  }, [dispatch]);

  const previewCard =
    card && parsed != null
      ? {
          ...card,
          title: (__title__ as string) ?? card.title,
          labels: (__labels__ as string[]) ?? card.labels,
          createdAt: (__createdAt__ as string) ?? card.createdAt,
          rawContent: contentRef.current ?? card.rawContent,
          parsedContent: parsed,
          fields: deepCopy(card.fields) ?? [],
        }
      : null;

  if (previewCard) {
    for (const [key, value] of Object.entries(metadata)) {
      const field = previewCard.fields.find((card) => card.key === key);
      // These types shouldn't exist
      if (field && !Array.isArray(value) && !(value instanceof Date) && value) {
        field.value = value;
      }
    }
  }

  const lastTitle = useAppSelector((state) => state.page.title);
  const selectedCardKey = useAppSelector((state) => state.page.cardKey);

  // Scroll to the last title when the tab is switched
  useEffect(() => {
    if (!lastTitle || !editor || !view || !state || cardKey !== selectedCardKey)
      return;

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
  }, [tab, editor, view]);

  // save the last title when user scrolls
  const handleScroll = () => {
    if (!view || !editor || !contentRef.current) return;

    const doc = asciiDoctor.load(contentRef.current || '');

    const title = findCurrentTitleFromADoc(view, editor, doc);

    // making sure the title actually changed to not spam redux
    if (!title || (title === lastTitle && cardKey === selectedCardKey)) {
      return;
    }

    dispatch(
      viewChanged({
        title,
        cardKey,
      }),
    );
  };

  // ref not provided, let's just use any
  const setRef = useCallback((ref: ReactCodeMirrorRef) => {
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

  const handleSave = async (
    data: Record<string, MetadataValue | undefined>,
  ) => {
    try {
      const { __title__, __labels__, __createdAt__, ...metadata } = data;
      const update: {
        content?: string;
        metadata: Record<string, MetadataValue>;
      } = {
        metadata: {},
      };

      for (const key of Object.keys(metadata)) {
        const field = card?.fields?.find((field) => field.key === key);
        if (
          field &&
          metadata[key] !== field.value &&
          !field.isCalculated &&
          metadata[key] !== undefined
        ) {
          update.metadata[key] = metadata[key];
        }
      }
      if (__title__ !== card.title && __title__ !== undefined) {
        update.metadata.title = __title__;
      }

      if (contentRef.current !== card.rawContent) {
        update.content = contentRef.current;
      }

      if (
        JSON.stringify(__labels__) !== JSON.stringify(card.labels) &&
        __labels__ !== undefined
      ) {
        update.metadata.labels = __labels__;
      }
      if (!card.createdAt && __createdAt__) {
        update.metadata.createdAt = __createdAt__;
      }

      await updateCard(update);
      const currentValues = getValues();
      reset(currentValues);
      contentRef.current = update.content ?? card.rawContent ?? '';
      dispatch(isEdited(false));
      dispatch(
        addNotification({
          message: t('saveCard.success'),
          type: 'success',
        }),
      );
      afterSave?.();
    } catch (error) {
      dispatch(
        addNotification({
          message: error instanceof Error ? error.message : '',
          type: 'error',
        }),
      );
    }
  };

  const expandedLinkTypes = card.cardType
    ? expandLinkTypes(linkTypes, card.cardType)
    : [];

  return (
    <>
      <Stack height="100%">
        <FormProvider {...formMethods}>
          <CardToolbar
            cardKey={cardKey}
            afterDelete={afterDelete}
            linkButtonDisabled={true}
            presenceMode="editing"
          />
          <Stack flexGrow={1} minHeight={0} padding={3}>
            <Stack
              direction="row"
              justifyContent="flex-end"
              spacing={1}
              sx={{ mb: 1 }}
            >
              <Button
                id="cancelButton"
                variant="plain"
                aria-label="cancel"
                size="sm"
                color="neutral"
                onClick={handleCancel}
                disabled={readOnly || isSubmitting}
              >
                {t('cancel')}
              </Button>
              <Button
                variant="solid"
                size="sm"
                aria-label="update"
                data-cy="updateButton"
                loading={isSubmitting}
                onClick={() => handleSubmit(handleSave)()}
                disabled={readOnly || !isEditedValue || isSubmitting}
              >
                {t('update')}
              </Button>
            </Stack>
            <Tabs
              value={tab}
              onChange={(_, newValue) =>
                typeof newValue === 'number' && setTab(newValue)
              }
              sx={{
                height: '100%',
                bgcolor: 'transparent',
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
                <Stack direction="row" height="100%" gap={3}>
                  <Box
                    height="100%"
                    sx={{
                      overflowY: 'auto',
                      scrollbarWidth: 'thin',
                    }}
                    width="70%"
                    padding={2}
                    onScroll={handleScroll}
                  >
                    <Controller
                      name="__title__"
                      control={control}
                      render={({ field: { value, onChange } }) => (
                        <Textarea
                          {...TITLE_FIELD_PROPS}
                          color="primary"
                          variant="plain"
                          value={value as string}
                          onChange={onChange}
                          sx={{
                            ...TITLE_FIELD_PROPS.sx,
                            bgcolor: 'background.surface',
                            borderRadius: 16,
                            marginBottom: 1.2,
                          }}
                        />
                      )}
                    />
                    <AsciiDocToolbar view={view} readOnly={readOnly} />
                    <CodeMirror
                      {...CODE_MIRROR_BASE_PROPS}
                      ref={setRef}
                      theme={
                        isDarkMode
                          ? CODE_MIRROR_THEMES.dark
                          : CODE_MIRROR_THEMES.light
                      }
                      extensions={extensions}
                      value={contentRef.current}
                      onDrop={(e) =>
                        handleAttachmentDrop(
                          e,
                          view,
                          editor,
                          card?.attachments,
                          card?.key ?? '',
                        )
                      }
                      onChange={(value: string) => {
                        if (!isEditedValue) {
                          dispatch(isEdited(true));
                        }
                        contentRef.current = value;
                      }}
                      readOnly={readOnly}
                    />
                  </Box>
                  <Box
                    flexGrow={1}
                    display="flex"
                    flexDirection="column"
                    padding={2}
                    sx={{
                      scrollbarWidth: 'thin',
                      overflowY: 'auto',
                    }}
                    alignItems="flex-start"
                    width="30%"
                  >
                    <AttachmentPanel
                      cardKey={cardKey}
                      attachments={card?.attachments ?? []}
                      onInsert={(attachment) => {
                        if (view && card) {
                          addAttachment(view, attachment, card.key);
                        }
                      }}
                    />
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
                    {/* Note: It is very important that CardLayout is not rendered unless we have gotten the parsed response.
                        LoadingGate ensures that it will show up as loading until previewCard is not null*/}

                    <CardLayout
                      card={previewCard!}
                      linkTypes={expandedLinkTypes}
                      preview={true}
                      cards={tree}
                      connectors={[]}
                      linkFormState="hidden"
                    />
                  </LoadingGate>
                </Box>
              </TabPanel>
            </Tabs>
          </Stack>
        </FormProvider>
      </Stack>
    </>
  );
}
