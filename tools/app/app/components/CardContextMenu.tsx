import * as React from 'react'
import MoreIcon from '@mui/icons-material/MoreHoriz'


import { useState } from 'react'
import { CardDetails, CardMetadata } from '../lib/definitions'
import {
  Button,
  Modal,
  DialogActions,
  DialogContent,
  ModalDialog,
  DialogTitle,
  Table,
  MenuButton,
  Menu,
  MenuItem,
  Divider,
  Typography,
  Dropdown,
} from '@mui/joy'
import { useTranslation } from 'react-i18next'
import DeleteDialog from './DeleteDialog'
import { set } from 'react-hook-form'

interface CardContextMenuProps {
  card: CardDetails | null
}

const CardContextMenu: React.FC<CardContextMenuProps> = ({ card }) => {
  const [isMetadataDialogOpen, setIsMetadataDialogOpen] = useState(false)

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)

  const { t } = useTranslation()

  return (
    <>
      <Dropdown>
        <MenuButton size="sm">
          <MoreIcon />
        </MenuButton>
        <Menu>
          <MenuItem onClick={() => setIsMetadataDialogOpen(true)}>
            {t('metadata')}
          </MenuItem>
          <Divider />
          <MenuItem onClick={() => setIsDeleteDialogOpen(true)}>
            <Typography color="danger">{t('deleteCard')}</Typography>
          </MenuItem>
        </Menu>
      </Dropdown>

      <Modal
        open={isMetadataDialogOpen}
        onClose={() => setIsMetadataDialogOpen(false)}
      >
        <ModalDialog>
          <DialogTitle
            id="metadata-modal-title"
            level="title-md"
            component="h2"
          >
            {card?.key} {t('metadata').toLowerCase()}
          </DialogTitle>
          <DialogContent>
            <Typography>{renderMetadata(t, card?.metadata)}</Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setIsMetadataDialogOpen(false)} autoFocus>
              {t('close')}
            </Button>
          </DialogActions>
        </ModalDialog>
      </Modal>
      <DeleteDialog
        title={t('deleteCard')}
        open={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onDelete={() => {}}
        warning={t('deleteCardWarning')}
        content="fdssssssssssssssssssssssssssssssssssssssssssssssssssssssssssss"
      />
    </>
  )
}

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

export default CardContextMenu
