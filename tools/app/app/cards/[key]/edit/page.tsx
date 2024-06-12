'use client'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CardDetails,
  CardMode,
  MetadataValue,
  WorkflowTransition,
} from '@/app/lib/definitions'
import Box from '@mui/material/Box'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Typography from '@mui/material/Typography'
import { CircularProgress, Stack, TextField } from '@mui/material'
import ContentToolbar from '@/app/components/ContentToolbar'
import { useRouter, useSearchParams } from 'next/navigation'
import { ContentArea } from '@/app/components/ContentArea'
import ErrorBar from '@/app/components/ErrorBar'
import {
  useCard,
  useCardType,
  useFieldTypes,
  useProject,
} from '@/app/lib/api/index'
import { useDynamicForm, useError } from '@/app/lib/utils'
import { useTranslation } from 'react-i18next'
import ExpandingBox from '@/app/components/ExpandingBox'
import {
  generateExpandingBoxValues,
  getEditableFields,
} from '@/app/lib/components'
import { Controller, useForm } from 'react-hook-form'
import { cardMetadata } from '@cyberismocom/data-handler/interfaces/project-interfaces'

export default function Page({ params }: { params: { key: string } }) {
  const { t } = useTranslation()

  // Original card and project
  const { project } = useProject()
  const { card, updateCard } = useCard(params.key)
  const { fieldTypes } = useFieldTypes()
  const cardType = useMemo(() => {
    return project?.cardTypes.find((ct) => ct.name === card?.metadata?.cardtype)
  }, [project, card])

  const searchParams = useSearchParams()

  // Edited card content and metadata
  const [value, setValue] = useState<number>(0)

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

  const handleChange = (event: React.SyntheticEvent, newValue: number) => {
    setValue(newValue)
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
      />
      <Stack flexGrow={1} minHeight={0} padding={3} paddingRight={0}>
        <Stack
          borderColor="divider"
          borderBottom={1}
          direction="row"
          width="70%"
        >
          <Box flexGrow={1} />
          <Tabs value={value} onChange={handleChange}>
            <Tab label={t('edit')} />
            <Tab label={t('preview')} />
          </Tabs>
        </Stack>

        <TabPanel value={value} index={0}>
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
                <TextField
                  inputProps={{
                    style: { fontSize: '1.2em', fontWeight: 'bold' },
                  }}
                  sx={{
                    marginBottom: '10px',
                  }}
                  fullWidth
                  multiline={true}
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
                <TextField
                  minRows={10}
                  multiline={true}
                  fullWidth
                  value={value}
                  onChange={onChange}
                />
              )}
            />
          </Box>
        </TabPanel>
        <TabPanel value={value} index={1}>
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
      </Stack>
      <ErrorBar error={reason} onClose={handleClose} />
    </Stack>
  )
}

interface TabPanelProps {
  children?: React.ReactNode
  index: any
  value: any
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props

  return (
    <Box
      role="tabpanel"
      hidden={value !== index}
      id={`simple-tabpanel-${index}`}
      {...other}
      minHeight={0}
      flexGrow={1}
    >
      {value === index && (
        <Box paddingTop={3} height="100%">
          <Typography component="span" height="100%">
            {children}
          </Typography>
        </Box>
      )}
    </Box>
  )
}
