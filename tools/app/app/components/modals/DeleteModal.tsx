import React, { useCallback, useEffect, useMemo } from 'react'
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
import { Trans, useTranslation } from 'react-i18next'
import { Warning } from '@mui/icons-material'
import { useCard } from '../../lib/api'
import {
  useErrorWrapper,
  useChildAmount,
  useIsMounted,
  useParentCard,
} from '@/app/lib/hooks'
import { useRouter } from 'next/navigation'

export interface DeleteModalProps {
  open: boolean
  onClose: () => void
  cardKey: string
}

export function DeleteModal({ open, onClose, cardKey }: DeleteModalProps) {
  const { t } = useTranslation()
  const [checked, setChecked] = React.useState(false)

  const { deleteCard } = useCard(cardKey)
  const childAmount = useChildAmount(cardKey)

  const parent = useParentCard(cardKey)

  const router = useRouter()

  const isMounted = useIsMounted()

  const warning = useMemo(
    () =>
      childAmount > 1
        ? t('deleteCardModal.warning', { cardAmount: childAmount })
        : undefined,
    [childAmount, t]
  )

  const content = useMemo(
    () => (
      <Trans
        i18nKey="deleteCardModal.content"
        values={{
          card: cardKey,
        }}
        count={childAmount}
        components={{
          bold: <Typography fontWeight="bold" />,
        }}
      />
    ),
    [cardKey, childAmount]
  )

  const deleteCardWrapper = useErrorWrapper('deleteCard', deleteCard)

  const handleDelete = useCallback(async () => {
    await deleteCardWrapper(t('deleteCardModal.success', { card: cardKey }))
    if (isMounted) {
      onClose()
      if (parent) {
        router.push(`/cards/${parent.key}`)
      } else {
        router.push('/cards')
      }
    }
  }, [deleteCardWrapper, onClose, cardKey, isMounted, t, parent, router])

  // Reset checkbox state when dialog is closed/opened
  useEffect(() => {
    setChecked(false)
  }, [open])

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog>
        <DialogTitle>{t('deleteCardModal.title')}</DialogTitle>
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
              onClick={handleDelete}
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

export default DeleteModal
