'use client'
import { ContentArea } from '@/app/components/ContentArea'
import ContentToolbar from '@/app/components/ContentToolbar'
import { cardViewed, errorEvent, successEvent } from '@/app/lib/actions'
import { useCard, useFieldTypes, useProject } from '@/app/lib/api'
import { generateExpandingBoxValues } from '@/app/lib/components'
import { CardMode, WorkflowTransition } from '@/app/lib/definitions'
import { useAppDispatch } from '@/app/lib/hooks'
import { findCard } from '@/app/lib/utils'
import { Box, Stack } from '@mui/joy'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

export const dynamic = 'force-dynamic'

export default function Page({ params }: { params: { key: string } }) {
  const { project } = useProject()
  const { card, error, updateCard, deleteCard } = useCard(params.key)

  const listCard = useMemo(() => {
    return project && card ? findCard(project.cards, card?.key) : undefined
  }, [project, card])

  const { t } = useTranslation()

  const dispatch = useAppDispatch()

  const { fieldTypes } = useFieldTypes()

  const cardType = useMemo(() => {
    return project?.cardTypes.find((ct) => ct.name === card?.metadata?.cardtype)
  }, [project, card])

  const router = useRouter()

  const handleStateTransition = async (transition: WorkflowTransition) => {
    try {
      await updateCard({ state: { name: transition.name } })
    } catch (error) {
      dispatch(
        errorEvent({
          name: 'stateTransition',
          message: error instanceof Error ? error.message : '',
        })
      )
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

  useEffect(() => {
    if (listCard) {
      dispatch(
        cardViewed({
          key: listCard.key,
          children: listCard?.children?.map((c) => c.key) ?? [],
          timestamp: new Date().toISOString(),
        })
      )
    }
  }, [listCard, dispatch])

  return (
    <Stack height="100%">
      <ContentToolbar
        cardKey={params.key}
        project={project}
        mode={CardMode.VIEW}
        onUpdate={() => {}}
        onStateTransition={handleStateTransition}
        onDelete={async (_, done) => {
          try {
            await deleteCard()
            router.push('/cards')
            dispatch(
              successEvent({
                name: 'deleteCard',
                message: t('deleteCard.success'),
              })
            )
          } catch (error) {
            dispatch(
              errorEvent({
                name: 'deleteCard',
                message: error instanceof Error ? error.message : '',
              })
            )
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
    </Stack>
  )
}
