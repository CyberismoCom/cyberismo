/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

'use client';
import React, { useEffect, useRef } from 'react';
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
import { useAppDispatch, useAppRouter } from '@/app/lib/hooks';
import { addNotification } from '@/app/lib/slices/notifications';
import MetadataView from '@/app/components/MetadataView';
import Image from 'next/image';
import { Delete, Download, Edit, InsertDriveFile } from '@mui/icons-material';
import { addAttachment } from '@/app/lib/codemirror';
import { apiPaths } from '@/app/lib/swr';
import { useAttachments } from '@/app/lib/api/attachments';
import { isEdited } from '@/app/lib/slices/pageState';
import LoadingGate from '@/app/components/LoadingGate';
import { openAttachment } from '@/app/lib/api/actions';

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

  const [isHovered, setIsHovered] = React.useState(false);

  const dispatch = useAppDispatch();

  return (
    <Card
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      sx={{
        width: '100%',
        gap: 0,
        cursor: 'pointer',
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
          <IconButton
            color="danger"
            variant="solid"
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
          <IconButton
            variant="solid"
            color="primary"
            onClick={(e) => e.stopPropagation()}
          >
            <Link
              endDecorator={<Download />}
              href={apiPaths.attachment(cardKey, name)}
              download
              variant="solid"
            />
          </IconButton>
          <IconButton
            variant="solid"
            color="primary"
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
        </Box>
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

  const editor = useRef<ReactCodeMirrorRef>(null);

  const formMethods = useForm();

  const { handleSubmit, control, watch } = formMethods;

  const preview = watch();

  const { __content__, __title__, ...metadata } = preview;

  // Here we assume that metadata contains valid metadata values
  const previewCard = (
    card
      ? {
          ...card,
          metadata: {
            ...card.metadata,
            title: __title__ ?? card.metadata?.title,
            ...metadata,
          },
          content: __content__ ?? card.content,
        }
      : null
  ) as CardDetails | null;

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
            defaultValue={0}
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
                    defaultValue={card.content}
                    render={({ field: { value, onChange } }: any) => (
                      <CodeMirror
                        value={value}
                        onChange={onChange}
                        ref={editor}
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
                          if (editor.current && editor.current.view && card) {
                            addAttachment(
                              editor.current.view,
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
                <LoadingGate values={[linkTypes]}>
                  <ContentArea
                    card={previewCard}
                    linkTypes={linkTypes!}
                    project={project}
                    preview={true}
                  />
                </LoadingGate>
              </Box>
            </TabPanel>
          </Tabs>
        </Stack>
      </FormProvider>
    </Stack>
  );
}
