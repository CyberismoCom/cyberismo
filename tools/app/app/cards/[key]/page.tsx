'use client'
import { ContentArea } from '@/app/components/ContentArea'
import ContentToolbar from '@/app/components/ContentToolbar'
import ErrorBar from '@/app/components/ErrorBar'
import ExpandingBox from '@/app/components/ExpandingBox'
import { useCard, useCardType, useFieldTypes, useProject } from '@/app/lib/api'
import {
  generateExpandingBoxValues,
  getEditableFields,
} from '@/app/lib/components'
import { CardMode, WorkflowTransition } from '@/app/lib/definitions'
import { useError } from '@/app/lib/utils'
import { Box, Stack } from '@mui/material'
import { useMemo } from 'react'
import { useForm } from 'react-hook-form'

export const dynamic = 'force-dynamic'

export default function Page({ params }: { params: { key: string } }) {
  const { project } = useProject()
  const { card, error, updateCard } = useCard(params.key)
  const { reason, setError, handleClose } = useError()

  const { fieldTypes } = useFieldTypes()
  const { cardType } = useCardType(card?.metadata?.cardtype ?? null)

  const handleStateTransition = async (transition: WorkflowTransition) => {
    try {
      await updateCard({ state: { name: transition.name } })
    } catch (error) {
      if (error instanceof Error) setError(error.message)
    }
  }

  const { control, reset } = useForm()

  const fields = useMemo(() => {
    if (!card || !cardType) return []
    let { values, fields } = generateExpandingBoxValues(
      card,
      fieldTypes,
      ['key', 'type'].concat(cardType.alwaysVisibleFields ?? []) ?? [
        'key',
        'type',
      ],
      []
    )

    reset(values)
    return fields
  }, [card, fieldTypes, cardType, reset])

  return (
    <Stack height="100%">
      <ContentToolbar
        selectedCard={card}
        project={project}
        mode={CardMode.VIEW}
        onUpdate={() => {}}
        onStateTransition={handleStateTransition}
      />
      <Box flexGrow={1} minHeight={0}>
        <Box width="65%" maxWidth="46rem">
          <ExpandingBox
            values={fields}
            color="bgsoft.main"
            editMode={false}
            control={control}
          />
        </Box>
        <Box padding={3}>
          <ContentArea card={card} error={error?.message} preview={false} />
        </Box>
      </Box>
      <ErrorBar error={reason} onClose={handleClose} />
    </Stack>
  )
}
