/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

'use client';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { CardMode, MetadataValue } from '@/app/lib/definitions';

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
} from '@mui/joy';

import CodeMirror, { ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { StreamLanguage } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { asciidoc } from 'codemirror-asciidoc';

import ContentToolbar from '@/app/components/ContentToolbar';
import { useSearchParams } from 'next/navigation';
import { ContentArea } from '@/app/components/ContentArea';
import { useCard, useProject, useLinkTypes } from '@/app/lib/api';
import { useTranslation } from 'react-i18next';
import { Controller, FormProvider, set, useForm } from 'react-hook-form';
import { useAppDispatch, useAppRouter, useAppSelector } from '@/app/lib/hooks';
import { addNotification } from '@/app/lib/slices/notifications';
import MetadataView from '@/app/components/MetadataView';
import Image from 'next/image';
import { Delete, InsertDriveFile } from '@mui/icons-material';
import {
  addAttachment,
  findCurrentTitleFromADoc,
  findSection,
} from '@/app/lib/codemirror';
import { apiPaths } from '@/app/lib/swr';
import { useAttachments } from '@/app/lib/api/attachments';
import { isEdited, viewChanged } from '@/app/lib/slices/pageState';
import AsciiDoctor from '@asciidoctor/core';

const asciiDoctor = AsciiDoctor();

const extensions = [StreamLanguage.define(asciidoc), EditorView.lineWrapping];

function AttachmentPreviewCard({
  name,
  children,
  cardKey,
}: {
  name: string;
  children?: React.ReactNode;
  cardKey: string;
}) {
  const { removeAttachment } = useAttachments(cardKey);
  const [isUpdating, setIsUpdating] = React.useState(false);

  return (
    <Card
      sx={{
        width: '100%',
        gap: 0,
        cursor: 'pointer',
      }}
    >
      <CardOverflow>
        <IconButton
          color="danger"
          variant="solid"
          sx={{
            position: 'absolute',
            top: 0,
            right: 0,
            zIndex: 1,
          }}
          loading={isUpdating}
          onClick={async (e) => {
            e.stopPropagation();
            setIsUpdating(true);
            await removeAttachment(name);
            setIsUpdating(false);
          }}
        >
          <Delete />
        </IconButton>
        <AspectRatio
          ratio="1"
          maxHeight={100}
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

export default function Page({ params }: { params: { key: string } }) {
  const { t } = useTranslation();

  const { project } = useProject();

  const { card, updateCard } = useCard(params.key);

  const { linkTypes } = useLinkTypes();

  const searchParams = useSearchParams();

  const dispatch = useAppDispatch();

  const router = useAppRouter();

  const [codemirror, setCodemirror] = React.useState<ReactCodeMirrorRef | null>(
    null,
  );

  const [tab, setTab] = React.useState(0);

  const formMethods = useForm();

  const {
    handleSubmit,
    control,
    watch,
    formState: { isDirty },
  } = formMethods;

  const preview = watch();

  const previewCard = useMemo(() => {
    const { __content__, __title__, ...metadata } = preview;
    return {
      ...card!,
      metadata: {
        ...card!.metadata!,
        title: __title__,
        ...metadata,
      },
      content: __content__,
    };
  }, [preview, card]);

  useEffect(() => {
    if (!card || Object.keys(preview).length === 0) {
      return;
    }
    const { __content__, __title__, ...metadata } = preview;

    if (
      __content__ === card.content &&
      __title__ === card.metadata?.title &&
      Object.keys(metadata).every(
        (key) => card?.metadata?.[key] === metadata[key],
      )
    ) {
      dispatch(isEdited(false));
      return;
    }
    dispatch(isEdited(true));
  }, [preview, card, dispatch]);

  useEffect(() => {
    return () => {
      dispatch(isEdited(false));
    };
  }, [dispatch]);

  const lastTitle = useAppSelector((state) => state.page.title);
  const cardKey = useAppSelector((state) => state.page.cardKey);

  // Scroll to the last title when the tab is switched
  useEffect(() => {
    if (
      !lastTitle ||
      !codemirror?.editor ||
      !codemirror.view ||
      !codemirror.state ||
      cardKey !== params.key
    )
      return;

    let lineNum: number | null = null;

    const doc = asciiDoctor.load(card?.content || '');

    const section = findSection(doc, lastTitle);
    if (!section) return;

    const lines = codemirror.state.doc.lines;

    for (let i = 1; i < lines + 1; i++) {
      const line = codemirror.state.doc.line(i);

      const title = section.getTitle();

      if (!title) continue;
      if (line.text.includes(title)) {
        lineNum = line.number;
        break;
      }
    }
    if (!lineNum) return;

    const pos = codemirror.state.doc.line(lineNum).from;

    codemirror.view.dispatch({
      effects: EditorView.scrollIntoView(pos, {
        y: 'start',
      }),
    });
  }, [tab, card, codemirror]);

  const setRef = useCallback((ref: ReactCodeMirrorRef) => {
    setCodemirror(ref);
  }, []);

  const doc = useMemo(() => {
    return asciiDoctor.load(preview.__content__ || '');
  }, [preview]);

  // save the last title when user scrolls
  const handleScroll = () => {
    if (!codemirror?.view || !codemirror.editor) return;

    const title = findCurrentTitleFromADoc(
      codemirror.view,
      codemirror.editor,
      doc,
    );

    if (!title) {
      return;
    }

    dispatch(
      viewChanged({
        title,
        cardKey: params.key,
      }),
    );
  };

  const handleSave = async (data: Record<string, MetadataValue>) => {
    try {
      const { __content__, __title__, ...metadata } = data;
      const update: Record<string, MetadataValue> = metadata;

      await updateCard({
        content: __content__ as string,
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

  return (
    <Stack height="100%">
      <FormProvider {...formMethods}>
        <ContentToolbar
          cardKey={params.key}
          mode={CardMode.EDIT}
          onUpdate={() => handleSubmit(handleSave)()}
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
              <Tab>{t('edit')}</Tab>
              <Tab>{t('preview')}</Tab>
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
                    defaultValue={card?.metadata?.title || ''}
                    render={({ field: { value, onChange } }: any) => (
                      <Textarea
                        sx={{
                          marginBottom: '10px',
                          fontWeight: 'bold',
                          fontSize: '1.2rem',
                        }}
                        value={value}
                        onChange={onChange}
                      />
                    )}
                  />
                  <Box paddingY={3}>
                    <MetadataView
                      initialExpanded={searchParams.get('expand') === 'true'}
                      editMode={true}
                      metadata={card?.metadata}
                    />
                  </Box>
                  <Controller
                    name="__content__"
                    control={control}
                    defaultValue={card?.content || ''}
                    render={({ field: { value, onChange } }: any) => (
                      <CodeMirror
                        value={value}
                        onChange={onChange}
                        ref={setRef}
                        extensions={extensions}
                        style={{
                          border: '1px solid',
                          borderColor: 'rgba(0,0,0,0.23)',
                          borderRadius: 4,
                        }}
                      />
                    )}
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
                  <Stack direction="row" padding={4} paddingTop={0}>
                    <Typography
                      level="body-xs"
                      color="warning"
                      variant="soft"
                      borderRadius={40}
                      paddingX={1}
                    >
                      {card?.attachments?.length || 0}
                    </Typography>
                    <Typography level="body-xs" marginLeft={2}>
                      {t('attachments')}
                    </Typography>
                  </Stack>
                  <Grid container gap={2} paddingLeft={3}>
                    {card?.attachments?.map((attachment) => (
                      <Grid
                        key={attachment.fileName}
                        display="flex"
                        justifyContent="center"
                        width={146}
                        onClick={() => {
                          if (codemirror?.view && card) {
                            addAttachment(
                              codemirror.view,
                              attachment,
                              card.key,
                            );
                          }
                        }}
                      >
                        <AttachmentPreviewCard
                          name={attachment.fileName}
                          cardKey={params.key}
                        >
                          {attachment.mimeType.startsWith('image') ? (
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
                <ContentArea
                  card={previewCard}
                  error={null}
                  linkTypes={linkTypes}
                  project={project}
                  preview={true}
                />
              </Box>
            </TabPanel>
          </Tabs>
        </Stack>
      </FormProvider>
    </Stack>
  );
}
