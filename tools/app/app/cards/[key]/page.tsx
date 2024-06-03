'use client'
import { ContentArea } from '@/app/components/ContentArea'
import ContentToolbar from '@/app/components/ContentToolbar'
import ErrorBar from '@/app/components/ErrorBar'
import { useCard, useProject } from '@/app/lib/api'
import { CardMode, WorkflowTransition } from '@/app/lib/definitions'
import { useError } from '@/app/lib/utils'
import { Box, Stack } from '@mui/material'

export const dynamic = 'force-dynamic'

export default function Page({ params }: { params: { key: string } }) {
  const { project } = useProject()
  const { card, error, updateCard } = useCard(params.key)
  const { reason, setError, handleClose } = useError()

  const handleStateTransition = async (transition: WorkflowTransition) => {
    try {
      await updateCard({ state: { name: transition.name } })
    } catch (error) {
      if (error instanceof Error) setError(error.message)
    }
  }
  return (
    <Stack height="100%">
      <ContentToolbar
        selectedCard={card}
        project={project}
        mode={CardMode.VIEW}
        onUpdate={() => {}}
        onStateTransition={handleStateTransition}
      />
      <Box padding={3} flexGrow={1} minHeight={0}>
        <ContentArea card={card} error={error?.message} preview={false} />
      </Box>
      <ErrorBar error={reason} onClose={handleClose} />
    </Stack>
  )
}
