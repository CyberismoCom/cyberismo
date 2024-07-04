'use client';
import React, { useCallback, useEffect, useMemo } from 'react';
import { CardMode, MetadataValue } from '@/app/lib/definitions';

import { Box, Tab, Tabs, TabPanel, TabList, Stack, Textarea } from '@mui/joy';

import CodeMirror from '@uiw/react-codemirror';
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

export default function Page({ params }: { params: { key: string } }) {
  const { t } = useTranslation();

  const { card, updateCard } = useCard(params.key);

  const searchParams = useSearchParams();

  const dispatch = useAppDispatch();

  const router = useRouter();

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
                      extensions={[
                        StreamLanguage.define(asciidoc),
                        EditorView.lineWrapping,
                      ]}
                      style={{
                        border: '1px solid',
                        borderColor: 'rgba(0,0,0,0.23)',
                        borderRadius: 4,
                      }}
                    />
                  )}
                />
              </Box>
            </TabPanel>
            <TabPanel value={1}>
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
