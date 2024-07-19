/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

'use client';
import React, { useMemo, useRef } from 'react';
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
} from '@mui/joy';

import CodeMirror, { ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { StreamLanguage } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { asciidoc } from 'codemirror-asciidoc';

import ContentToolbar from '@/app/components/ContentToolbar';
import { useRouter, useSearchParams } from 'next/navigation';
import { ContentArea } from '@/app/components/ContentArea';
import { useCard } from '@/app/lib/api';
import { useTranslation } from 'react-i18next';
import { Controller, FormProvider, useForm } from 'react-hook-form';
import { useAppDispatch } from '@/app/lib/hooks';
import { addNotification } from '@/app/lib/slices/notifications';
import MetadataView from '@/app/components/MetadataView';
import { useAttachments } from '@/app/lib/api/attachments';
import Image from 'next/image';
import { InsertDriveFile } from '@mui/icons-material';
import { apiPaths } from '@/app/lib/swr';
import { addAttachment } from '@/app/lib/codemirror';

const extensions = [StreamLanguage.define(asciidoc), EditorView.lineWrapping];

function AttachmentPreviewCard({
  name,
  children,
}: {
  name: string;
  children?: React.ReactNode;
}) {
  return (
    <Card
      sx={{
        width: '100%',
        gap: 0,
        cursor: 'pointer',
      }}
    >
      <CardOverflow>
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

  const { card, updateCard } = useCard(params.key);

  const { attachments } = useAttachments(params.key);

  const searchParams = useSearchParams();

  const dispatch = useAppDispatch();

  const router = useRouter();

  const editor = useRef<ReactCodeMirrorRef>(null);

  const formMethods = useForm();
  const { handleSubmit, control, watch } = formMethods;

  const handleSave = async (data: Record<string, MetadataValue>) => {
    try {
      const { __content__, __title__, ...metadata } = data;
      const update: Record<string, MetadataValue> = metadata;

      await updateCard({
        content: __content__ as string,
        metadata: {
          ...update,
          summary: __title__,
        },
      });
      dispatch(
        addNotification({
          message: t('saveCard.success'),
          type: 'success',
        }),
      );
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

  const preview = watch();

  const previewCard = useMemo(() => {
    const { __content__, __title__, ...metadata } = preview;
    return {
      ...card!,
      metadata: {
        ...card!.metadata!,
        summary: __title__,
        ...metadata,
      },
      content: __content__,
    };
  }, [preview, card]);

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
                    defaultValue={card?.metadata?.summary || ''}
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
                      2
                    </Typography>
                    <Typography level="body-xs" marginLeft={2}>
                      {t('attachments')}
                    </Typography>
                  </Stack>
                  <Grid container gap={2} paddingLeft={3}>
                    {attachments.map((attachment) => (
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
                        <AttachmentPreviewCard name={attachment.fileName}>
                          {attachment.type === 'image' ? (
                            <Image src={attachment.image || ''} alt="" fill />
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
                <ContentArea card={previewCard} error={null} />
              </Box>
            </TabPanel>
          </Tabs>
        </Stack>
      </FormProvider>
    </Stack>
  );
}
