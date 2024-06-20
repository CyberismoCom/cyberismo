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

interface DeleteDialogProps {
  open: boolean
  onClose: () => void
  templates: string[]
  onCreate: (template: string) => void
  actionText?: string
}

function NewCardDialog({
  open,
  onClose,
  templates,
  onCreate,
  actionText,
}: DeleteDialogProps) {
  const { t } = useTranslation()
  const [chosenTemplate, setChosenTemplate] = React.useState<string | null>(
    null
  )

  useEffect(() => {
    setChosenTemplate(null)
  }, [open])

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog>
        <ModalClose />
        <DialogTitle>{t('newCardDialogTitle')}</DialogTitle>
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
            {templates.map((template) => (
              <Grid key={template} item>
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
                  onClick={() => setChosenTemplate(template)}
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
                      <Radio
                        checked={chosenTemplate === template}
                        variant="soft"
                      />
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
              </Grid>
            ))}
          </Grid>
          <DialogActions>
            <Button
              disabled={chosenTemplate === null}
              onClick={() => {
                if (chosenTemplate) {
                  onCreate(chosenTemplate)
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
            <Typography>{actionText}</Typography>
          </DialogActions>
        </DialogContent>
      </ModalDialog>
    </Modal>
  )
}

export default NewCardDialog
