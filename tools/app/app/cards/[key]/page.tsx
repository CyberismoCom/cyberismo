'use client'
import { ContentArea } from '@/app/components/ContentArea'
import ContentToolbar from '@/app/components/ContentToolbar'
import { cardViewed } from '@/app/lib/actions'
import { useCard, useFieldTypes, useProject } from '@/app/lib/api'
import { generateExpandingBoxValues } from '@/app/lib/components'
import { CardMode } from '@/app/lib/definitions'
import { useAppDispatch, useListCard } from '@/app/lib/hooks'
import { Box, Stack } from '@mui/joy'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'

export const dynamic = 'force-dynamic'

export default function Page({ params }: { params: { key: string } }) {
  const { project } = useProject()
  const { card, error } = useCard(params.key)

  const listCard = useListCard(params.key)

  const dispatch = useAppDispatch()

  const { fieldTypes } = useFieldTypes()

  const cardType = useMemo(() => {
    return project?.cardTypes.find((ct) => ct.name === card?.metadata?.cardtype)
  }, [project, card])

  const router = useRouter()

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
        mode={CardMode.VIEW}
        onUpdate={() => {}}
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
