'use client'
import { ContentArea } from '@/app/components/ContentArea'
import ContentToolbar from '@/app/components/ContentToolbar'
import ErrorBar from '@/app/components/ErrorBar'
import { useCard, useFieldTypes, useProject } from '@/app/lib/api'
import { generateExpandingBoxValues } from '@/app/lib/components'
import { Card, CardMode, WorkflowTransition } from '@/app/lib/definitions'
import { useError } from '@/app/lib/utils'
import { Box, Stack } from '@mui/joy'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'

export const dynamic = 'force-dynamic'

export default function Page({ params }: { params: { key: string } }) {
  const { project } = useProject()
  const { card, error, updateCard, deleteCard } = useCard(params.key)
  const { reason, setError, handleClose } = useError()

  const { fieldTypes } = useFieldTypes()

  const cardType = useMemo(() => {
    return project?.cardTypes.find((ct) => ct.name === card?.metadata?.cardtype)
  }, [project, card])

  const router = useRouter()

  const handleStateTransition = async (transition: WorkflowTransition) => {
    try {
      await updateCard({ state: { name: transition.name } })
    } catch (error) {
      if (error instanceof Error) setError(error.message)
    }
  }

  const { reset, control } = useForm()

  const { fields, values } = useMemo(() => {
    if (!card || !cardType) return { fields: [], values: {} }
    let { values, fields } = generateExpandingBoxValues(
      card,
      fieldTypes,
      ['key', 'type'].concat(cardType.alwaysVisibleFields ?? []) ?? [
        'key',
        'type',
      ],
      cardType.optionallyVisibleFields ?? [],
      []
    )

    return { fields, values }
  }, [card, fieldTypes, cardType])

  useEffect(() => {
    reset(values)
  }, [reset, values])

  return (
    <Stack height="100%">
      <ContentToolbar
        selectedCard={card}
        project={project}
        mode={CardMode.VIEW}
        onUpdate={() => {}}
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
      <Box flexGrow={1} minHeight={0}>
        <ContentArea
          card={card}
          error={error?.message}
          preview={false}
          values={fields}
          control={control}
          onMetadataClick={() => {
            router.push(`/cards/${params.key}/edit?expand=true`)
          }}
        />
      </Box>
      <ErrorBar error={reason} onClose={handleClose} />
    </Stack>
  )
}
