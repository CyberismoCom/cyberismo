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
                    padding: 0,
                    boxShadow: '0px 2px 2px 0px rgba(0, 0, 0, 0.5)',
                    cursor: 'pointer',
                  }}
                  onClick={() => setChosenTemplate(template)}
                >
                  <Stack direction="row" height="50%">
                    <Typography level="title-sm" padding={1} fontWeight="bold">
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
                    borderRadius="inherit"
                  >
                    <Typography level="body-xs" padding={1} fontWeight="bold">
                      Description placeholder
                    </Typography>
                  </Box>
                </Card>
              </Grid>
            ))}
          </Grid>
          <DialogActions>
            <Typography>{actionText}</Typography>
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
          </DialogActions>
        </DialogContent>
      </ModalDialog>
    </Modal>
  )
}

export default NewCardDialog
