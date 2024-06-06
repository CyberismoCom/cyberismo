'use client'
import { ContentArea } from '@/app/components/ContentArea'
import ContentToolbar from '@/app/components/ContentToolbar'
import ErrorBar from '@/app/components/ErrorBar'
import ExpandingBox from '@/app/components/ExpandingBox'
import { useCard, useFieldTypes, useProject } from '@/app/lib/api'
import { generateExpandingBoxValues } from '@/app/lib/components'
import { CardMode, WorkflowTransition } from '@/app/lib/definitions'
import { useError } from '@/app/lib/utils'
import { Box, Stack } from '@mui/material'
import { useMemo } from 'react'

export const dynamic = 'force-dynamic'

export default function Page({ params }: { params: { key: string } }) {
  const { project } = useProject()
  const { card, error, updateCard } = useCard(params.key)
  const { reason, setError, handleClose } = useError()

  const { fieldTypes } = useFieldTypes()

  const handleStateTransition = async (transition: WorkflowTransition) => {
    try {
      await updateCard({ state: { name: transition.name } })
    } catch (error) {
      if (error instanceof Error) setError(error.message)
    }
  }
  const fields = useMemo(
    () => generateExpandingBoxValues(card, fieldTypes, ['key', 'type']).fields,
    [card, fieldTypes]
  )

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
          <ExpandingBox values={fields} color="bgsoft.main" editMode={false} />
        </Box>
        <Box padding={3}>
          <ContentArea card={card} error={error?.message} preview={false} />
        </Box>
      </Box>
      <ErrorBar error={reason} onClose={handleClose} />
    </Stack>
  )
}
