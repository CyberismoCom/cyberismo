import React, { useEffect } from 'react'
import {
  Box,
  Modal,
  ModalDialog,
  Typography,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Card,
  Stack,
  Radio,
  ModalClose,
} from '@mui/joy'
import { useTranslation } from 'react-i18next'
import { Grid } from '@mui/material'
import { useCard, useTemplates } from '@/app/lib/api'
import { useAppDispatch } from '@/app/lib/hooks'
import { useRouter } from 'next/navigation'
import { addNotification } from '@/app/lib/slices/notifications'

interface NewCardModalProps {
  open: boolean
  onClose: () => void
  cardKey: string | null
}

export function TemplateCard({
  template,
  onClick,
  isChosen,
}: {
  template: string
  isChosen: boolean
  onClick: () => void
}) {
  return (
    <Card
      variant="outlined"
      sx={{
        height: '150px',
        width: '150px',
        boxShadow: '0px 2px 2px 0px rgba(0, 0, 0, 0.5)',
        cursor: 'pointer',
        padding: 0,
        overflow: 'hidden',
      }}
      onClick={onClick}
    >
      <Stack direction="row" height="50%" flexGrow={0}>
        <Typography
          level="title-lg"
          paddingTop={2}
          paddingLeft={2}
          fontWeight="bold"
        >
          {template}
        </Typography>
        <Box padding={1}>
          <Radio checked={isChosen} variant="soft" />
        </Box>
      </Stack>
      <Box
        height="50%"
        width="100%"
        overflow="clip"
        bgcolor="neutral.softBg"
        flexShrink={0}
        sx={{
          borderBottomLeftRadius: 'inherit',
          borderBottomRightRadius: 'inherit',
        }}
      >
        <Typography
          level="body-xs"
          fontWeight="bold"
          paddingLeft={2}
          paddingTop={2}
        >
          Description placeholder
        </Typography>
      </Box>
    </Card>
  )
}

export function NewCardModal({ open, onClose, cardKey }: NewCardModalProps) {
  const { t } = useTranslation()
  const [chosenTemplate, setChosenTemplate] = React.useState<string | null>(
    null
  )

  const router = useRouter()

  const { templates } = useTemplates()

  const { createCard, card } = useCard(cardKey)

  const dispatch = useAppDispatch()

  useEffect(() => {
    setChosenTemplate(null)
  }, [open])

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog>
        <ModalClose />
        <DialogTitle>{t('newCardDialog.title')}</DialogTitle>
        <DialogContent
          sx={{
            padding: 2,
          }}
        >
          <Grid
            container
            spacing={2}
            columnGap={2}
            justifyContent="center"
            sx={{
              overflowY: 'scroll',
            }}
          >
            {(templates || []).map((template) => (
              <Grid key={template} item>
                <TemplateCard
                  template={template}
                  isChosen={chosenTemplate === template}
                  onClick={() => setChosenTemplate(template)}
                />
              </Grid>
            ))}
          </Grid>
          <DialogActions>
            <Button
              disabled={chosenTemplate === null}
              onClick={async () => {
                if (chosenTemplate) {
                  try {
                    const cards = await createCard(chosenTemplate)
                    dispatch(
                      addNotification({
                        message: t('createCard.success'),
                        type: 'success',
                      })
                    )

                    if (cards && cards.length > 0) {
                      router.push(`/cards/${cards[0]}`)
                    }
                    onClose()
                  } catch (error) {
                    dispatch(
                      addNotification({
                        message: error instanceof Error ? error.message : '',
                        type: 'error',
                      })
                    )
                  }
                }
              }}
              color="primary"
            >
              {t('create')}
            </Button>
            <Button onClick={onClose} variant="plain" color="neutral">
              {t('cancel')}
            </Button>
            <Box flexGrow={1} />
            <Typography>
              {t('createUnder', { parent: card?.metadata?.summary || 'root' })}
            </Typography>
          </DialogActions>
        </DialogContent>
      </ModalDialog>
    </Modal>
  )
}

export default NewCardModal
