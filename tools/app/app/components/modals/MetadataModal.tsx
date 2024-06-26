import { useTranslation } from 'react-i18next'

import {
  Modal,
  ModalDialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Table,
} from '@mui/joy'
import { useCard } from '@/app/lib/api'
import { CardMetadata } from '@/app/lib/definitions'

const renderMetadata = (
  t: (key: string) => string,
  metadata?: CardMetadata
) => {
  return (
    <Table size="sm">
      <thead>
        <tr>
          <th>{t('name')}</th>
          <th>{t('value')}</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>{t('cardType')}</td>
          <td>{metadata?.cardtype}</td>
        </tr>
        <tr>
          <td>{t('summary')}</td>
          <td>{metadata?.summary}</td>
        </tr>
        <tr>
          <td>{t('workflowState')}</td>
          <td>{metadata?.workflowState}</td>
        </tr>
      </tbody>
    </Table>
  )
}

export interface MetadataModalProps {
  open: boolean
  onClose: () => void
  cardKey: string
}

export function MetadataModal({ open, onClose, cardKey }: MetadataModalProps) {
  const { t } = useTranslation()
  const { card } = useCard(cardKey)

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog>
        <DialogTitle id="metadata-modal-title" level="title-md" component="h2">
          {card?.key} {t('metadata').toLowerCase()}
        </DialogTitle>
        <DialogContent>
          <Typography>{renderMetadata(t, card?.metadata)}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} autoFocus>
            {t('close')}
          </Button>
        </DialogActions>
      </ModalDialog>
    </Modal>
  )
}

export default MetadataModal
