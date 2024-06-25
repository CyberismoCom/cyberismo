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
import { useCard, useProject } from '../lib/api'
import { useAppDispatch, useAppSelector } from '../lib/hooks'
import { findCard, findParentCard, useIsMounted } from '../lib/utils'
import { Stack } from '@mui/system'
import { Card, CardView } from '../lib/definitions'
import moment from 'moment'
import { successEvent, errorEvent } from '../lib/actions'

export interface MoveDialogProps {
  open: boolean
  onClose: () => void
  cardKey: string
}

function MoveCardDialog({ open, onClose, cardKey }: MoveDialogProps) {
  const { t } = useTranslation()

  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const { project } = useProject()
  const { updateCard } = useCard(cardKey)
  const recents = useAppSelector((state) => state.recentlyViewed.pages)
  const isMounted = useIsMounted()

  const dispatch = useAppDispatch()

  const parent = useMemo(
    () => findParentCard(project?.cards || [], cardKey),
    [project, cardKey]
  )

  const moveCard = useCallback(async () => {
    if (selected) {
      try {
        await updateCard({ parent: selected })
        for (let i = 0; i < 5; i++) {
          dispatch(
            successEvent({
              name: 'moveCard',
              message: t('moveDialog.success'),
            })
          )
        }
      } catch (err) {
        dispatch(
          errorEvent({
            name: 'moveCard',
            message: t('moveDialog.error'),
          })
        )
      }
      if (isMounted) {
        onClose()
      }
    }
  }, [selected, updateCard, onClose, isMounted, dispatch, t])

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
          (card) =>
            card !== null && card.key !== cardKey && card.key !== parent?.key
        ),
    [recents, project, cardKey, parent]
  ) as (Card & CardView)[]

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog>
        <DialogTitle>{t('moveDialog.title')}</DialogTitle>
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
                  placeholder={t('moveDialog.search')}
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
                  placeholder={t('moveDialog.search')}
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

export default MoveCardDialog
