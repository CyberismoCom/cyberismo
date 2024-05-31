'use client'
import { ContentArea } from '@/app/components/ContentArea'
import ContentToolbar from '@/app/components/ContentToolbar'
import ErrorBar from '@/app/components/ErrorBar'
import { useCard, useProject } from '@/app/lib/api'
import { CardMode, WorkflowTransition } from '@/app/lib/definitions'
import { useError } from '@/app/lib/utils'

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
    <main className="mainArea">
      <ContentToolbar
        selectedCard={card}
        project={project}
        mode={CardMode.VIEW}
        onUpdate={() => {}}
        onStateTransition={handleStateTransition}
      />
      <div className="contentPadding">
        <ContentArea card={card} error={error?.message} preview={false} />
      </div>
      <ErrorBar error={reason} onClose={handleClose} />
    </main>
  )
}
