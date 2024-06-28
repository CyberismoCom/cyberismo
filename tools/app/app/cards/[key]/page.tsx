'use client'
import { ContentArea } from '@/app/components/ContentArea'
import ContentToolbar from '@/app/components/ContentToolbar'
import { cardViewed } from '@/app/lib/actions'
import { useCard } from '@/app/lib/api'
import { CardMode } from '@/app/lib/definitions'
import { useAppDispatch, useListCard } from '@/app/lib/hooks'
import { Box, Stack } from '@mui/joy'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export const dynamic = 'force-dynamic'

export default function Page({ params }: { params: { key: string } }) {
  const { card, error } = useCard(params.key)

  const listCard = useListCard(params.key)

  const dispatch = useAppDispatch()

  const router = useRouter()

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
          onMetadataClick={() =>
            router.push(`/cards/${params.key}/edit?expand=true`)
          }
        />
      </Box>
    </Stack>
  )
}
