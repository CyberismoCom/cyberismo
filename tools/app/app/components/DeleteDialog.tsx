import React from 'react'
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

interface DeleteDialogProps {
  open: boolean
  title: string
  content?: string
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
  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog>
        <DialogTitle>{title}</DialogTitle>
        <Divider />
        <DialogContent>
          <Typography level="body-md">{content}</Typography>
          {warning && (
            <Alert variant="soft" color="danger">
              <Checkbox />
              {warning}
            </Alert>
          )}
          <DialogActions>
            <Button onClick={onClose}>{t('cancel')}</Button>
            <Button onClick={onDelete} color="danger">
              {t('delete')}
            </Button>
          </DialogActions>
        </DialogContent>
      </ModalDialog>
    </Modal>
  )
}

export default DeleteDialog
