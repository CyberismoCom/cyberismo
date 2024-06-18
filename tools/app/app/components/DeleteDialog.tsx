import React, { useEffect, useState } from 'react'
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
} from '@mui/joy'
import { useTranslation } from 'react-i18next'
import { Warning } from '@mui/icons-material'

interface DeleteDialogProps {
  open: boolean
  title: string
  content?: string | React.ReactNode
  warning?: string
  onClose: () => void
  onDelete: () => void
}

function DeleteDialog({
  open,
  title,
  content,
  warning,
  onClose,
  onDelete,
}: DeleteDialogProps) {
  const { t } = useTranslation()
  const [checked, setChecked] = React.useState(false)

  // Reset checkbox state when dialog is closed/opened
  useEffect(() => {
    setChecked(false)
  }, [open])

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog>
        <DialogTitle>{title}</DialogTitle>
        <Divider />
        <DialogContent>
          <Typography level="body-md">{content}</Typography>
          {warning && (
            <Alert variant="soft" color="danger" endDecorator={<Warning />}>
              <Checkbox
                label={
                  <Typography color="danger" variant="soft" fontWeight="normal">
                    {warning}
                  </Typography>
                }
                variant="outlined"
                checked={checked}
                onChange={(e) => setChecked(e.target.checked)}
              />
            </Alert>
          )}
          <DialogActions>
            <Button
              onClick={onDelete}
              color="danger"
              disabled={warning != null && !checked}
            >
              {t('delete')}
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

export default DeleteDialog
