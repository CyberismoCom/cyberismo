import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Checkbox,
  Modal,
  ModalDialog,
  Typography,
  DialogTitle,
  DialogContent,
  Divider,
  DialogActions,
  Button,
  Alert,
  Tabs,
  Tab,
  TabList,
  TabPanel,
  Input,
  Box,
} from '@mui/joy'
import { useTranslation } from 'react-i18next'
import { useCard, useProject } from '../../lib/api'
import {
  useAppDispatch,
  useAppSelector,
  useErrorWrapper,
  useIsMounted,
  useListCard,
  useParentCard,
} from '../../lib/hooks'
import { findCard, findParentCard, isChildOf } from '../../lib/utils'
import { Stack } from '@mui/system'
import { Card, CardView } from '../../lib/definitions'
import moment from 'moment'
import { successEvent, errorEvent } from '../../lib/actions'

export interface MoveCardModalProps {
  open: boolean
  onClose: () => void
  cardKey: string
}

export function MoveCardModal({ open, onClose, cardKey }: MoveCardModalProps) {
  const { t } = useTranslation()

  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const { project } = useProject()
  const { updateCard } = useCard(cardKey)
  const recents = useAppSelector((state) => state.recentlyViewed.pages)

  const isMounted = useIsMounted()

  const parent = useParentCard(cardKey)

  const card = useListCard(cardKey)

  const updateCardWrapper = useErrorWrapper('updateCard', updateCard)

  const moveCard = useCallback(async () => {
    if (selected) {
      await updateCardWrapper(t('moveCardModal.success'), { parent: selected })
      if (isMounted) {
        onClose()
      }
    }
  }, [selected, updateCardWrapper, t, onClose, isMounted])

  const recentCards = useMemo(
    () =>
      recents
        .map((page: CardView) => {
          const card = findCard(project?.cards || [], page.key)
          return card
            ? {
                ...card,
                ...page,
              }
            : null
        })
        .filter(
          // shouldn't include the current card or its parent or any child cards
          (c) =>
            card != null &&
            c != null &&
            parent != null &&
            c.key !== cardKey &&
            c.key !== parent.key &&
            !isChildOf(card, c.key)
        ),
    [recents, project, cardKey, parent, card]
  ) as (Card & CardView)[]

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog>
        <DialogTitle>{t('moveCardModal.title')}</DialogTitle>
        <Divider />
        <DialogContent
          sx={{
            width: 620,
          }}
        >
          <Tabs
            defaultValue={0}
            sx={{
              flex: '1 1 auto',
              overflowY: 'scroll',
              flexDirection: 'column',
              display: 'flex',
            }}
          >
            <TabList
              sx={{
                flex: '0 0 auto',
              }}
            >
              <Tab>{t('recents')}</Tab>
              <Tab>{t('all')}</Tab>
            </TabList>
            <TabPanel
              value={0}
              sx={{
                flex: '1 1 auto',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <Box paddingY={2}>
                <Input
                  placeholder={t('moveCardModal.search')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  color="primary"
                  variant="outlined"
                />
              </Box>
              <Box>
                {recentCards.map((page) => {
                  return (
                    <Box
                      paddingY={2}
                      paddingX={3}
                      key={page.key}
                      bgcolor={
                        selected === page.key
                          ? 'primary.plainActiveBg'
                          : 'inherit'
                      }
                      onClick={() => {
                        if (selected === page.key) {
                          setSelected(null)
                        } else {
                          setSelected(page.key)
                        }
                      }}
                      sx={{
                        cursor: 'pointer',
                      }}
                    >
                      <Stack direction="row" justifyContent="space-between">
                        <Stack>
                          <Typography level="title-sm">
                            {page.metadata?.summary}
                          </Typography>
                          <Typography level="body-sm">
                            {findParentCard(project?.cards || [], page.key)
                              ?.metadata?.summary ?? '-'}
                            {' • '}
                            {t('viewedAgo', {
                              time: moment
                                .duration(moment().diff(moment(page.timestamp)))
                                .humanize(),
                            })}
                          </Typography>
                        </Stack>
                        <Typography
                          level="body-xs"
                          fontWeight={600}
                          sx={{
                            color: 'text.primary',
                          }}
                        >
                          {page.key}
                        </Typography>
                      </Stack>
                    </Box>
                  )
                })}
              </Box>
            </TabPanel>
            <TabPanel value={1}>
              <Box paddingY={2}>
                <Input
                  placeholder={t('moveCardModal.search')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  color="primary"
                  variant="outlined"
                />
              </Box>
            </TabPanel>
          </Tabs>

          <DialogActions>
            <Button onClick={moveCard} disabled={selected === null}>
              {t('move')}
            </Button>
            <Button onClick={onClose} variant="plain" color="neutral">
              {t('cancel')}
            </Button>
          </DialogActions>
        </DialogContent>
      </ModalDialog>
    </Modal>
  )
}

export default MoveCardModal
