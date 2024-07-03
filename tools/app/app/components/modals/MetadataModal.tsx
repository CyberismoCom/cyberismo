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
import { cardMetadata } from '@cyberismocom/data-handler/interfaces/project-interfaces'
import moment from 'moment'

function Metadata({
  cardtype,
  summary,
  workflowState,
  lastTransitioned,
}: cardMetadata) {
  const {t} = useTranslation()
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
          <td>{cardtype}</td>
        </tr>
        <tr>
          <td>{t('summary')}</td>
          <td>{summary}</td>
        </tr>
        <tr>
          <td>{t('workflowState')}</td>
          <td>{workflowState}</td>
        </tr>
        <tr>
          <td>{t('lastTransitioned')}</td>
          <td>{lastTransitioned && moment(lastTransitioned).fromNow()}</td>
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
          {card?.metadata ? (
            <Metadata {...card.metadata} />
          ) : (
            <Typography level="body-xs">{t('metadataNotFound')}</Typography>
          )}
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
