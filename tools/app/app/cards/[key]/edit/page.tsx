'use client'
import React, { useCallback, useMemo, useState } from 'react'
import {
  CardMode,
  MetadataValue,
  WorkflowTransition,
} from '@/app/lib/definitions'

import {
  Box,
  Tab,
  Tabs,
  Input,
  TabPanel,
  TabList,
  CircularProgress,
  Stack,
  Textarea,
} from '@mui/joy'

import ContentToolbar from '@/app/components/ContentToolbar'
import { useRouter, useSearchParams } from 'next/navigation'
import { ContentArea } from '@/app/components/ContentArea'
import ErrorBar from '@/app/components/ErrorBar'
import { useCard, useFieldTypes, useProject } from '@/app/lib/api/index'
import { useDynamicForm, useError } from '@/app/lib/utils'
import { useTranslation } from 'react-i18next'
import ExpandingBox from '@/app/components/ExpandingBox'
import {
  generateExpandingBoxValues,
  getEditableFields,
} from '@/app/lib/components'
import { Controller } from 'react-hook-form'

export default function Page({ params }: { params: { key: string } }) {
  const { t } = useTranslation()

  // Original card and project
  const { project } = useProject()
  const { card, updateCard, deleteCard } = useCard(params.key)
  const { fieldTypes } = useFieldTypes()
  const cardType = useMemo(() => {
    return project?.cardTypes.find((ct) => ct.name === card?.metadata?.cardtype)
  }, [project, card])

  const searchParams = useSearchParams()

  const { reason, setError, handleClose } = useError()
  const router = useRouter()

  const { fields, values } = useMemo(() => {
    if (!card || !cardType || !fieldTypes) return { fields: [], values: {} }
    let { values, fields } = generateExpandingBoxValues(
      card,
      fieldTypes,
      [],
      (cardType.optionallyVisibleFields ?? []).concat(
        cardType.alwaysVisibleFields ?? []
      ),
      getEditableFields(card, cardType)
    )
    values['__title__'] = card.metadata?.summary ?? ''
    values['__content__'] = card.content ?? ''

    return { fields, values }
  }, [card, fieldTypes, cardType])

  const { handleSubmit, getValues, control, isReady } = useDynamicForm(values)

  const handleStateTransition = async (transition: WorkflowTransition) => {
    try {
      await updateCard({ state: { name: transition.name } })
    } catch (error) {
      if (error instanceof Error) setError(error)
    }
  }

  const handleSave = async (data: Record<string, MetadataValue>) => {
    try {
      const { __content__, __title__, ...metadata } = data
      const update: Record<string, MetadataValue> = {}
      for (const { key } of fields) {
        if (key === 'key' || key === 'type') continue
        update[key] = metadata[key]
      }

      await updateCard({
        content: __content__ as string,
        metadata: {
          ...update,
          summary: __title__,
        },
      })
      router.push(`/cards/${card!.key}`)
    } catch (error) {
      if (error instanceof Error) setError(error)
    }
  }

  const getPreview = useCallback(() => {
    if (!card) return null
    return {
      ...card!,
      content: getValues('__content__'),
      metadata: {
        ...card!.metadata!,
        summary: getValues('__title__'),
      },
    }
  }, [card, getValues])

  if (!isReady) return <CircularProgress />

  return (
    <Stack height="100%">
      <ContentToolbar
        selectedCard={card}
        project={project}
        mode={CardMode.EDIT}
        onUpdate={() => handleSubmit(handleSave)()}
        onStateTransition={handleStateTransition}
        onDelete={async (_, done) => {
          try {
            await deleteCard()
            router.push('/cards')
          } catch (error) {
            if (error instanceof Error) setError(error.message)
          } finally {
            done()
          }
        }}
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
                <ExpandingBox
                  values={fields}
                  color="bgsoft.main"
                  editMode={true}
                  control={control}
                  initialExpanded={searchParams.get('expand') === 'true'}
                />
              </Box>
              <Controller
                name="__content__"
                control={control}
                render={({ field: { value, onChange } }: any) => (
                  <Textarea value={value} onChange={onChange} minRows={10} />
                )}
              />
            </Box>
          </TabPanel>
          <TabPanel value={1}>
            <Box height="100%">
              <ContentArea
                card={getPreview()}
                error={null}
                preview={true}
                values={fields}
                control={control}
              />
            </Box>
          </TabPanel>
        </Tabs>
      </Stack>
      <ErrorBar error={reason} onClose={handleClose} />
    </Stack>
  )
}