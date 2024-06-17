import * as React from 'react'
import MoreIcon from '@mui/icons-material/MoreHoriz'


import { useState, useMemo, useCallback } from 'react'
import { CardDetails, CardMetadata, Project, Card } from '../lib/definitions'
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
import { Trans, useTranslation } from 'react-i18next'
import DeleteDialog from './DeleteDialog'
import { countChildren, findCard, useIsMounted } from '../lib/utils'

interface CardContextMenuProps {
  card: CardDetails | null
  project: Project | null
  onDelete?: (key: string, done: () => void) => void
}

const CardContextMenu: React.FC<CardContextMenuProps> = ({
  card,
  project,
  onDelete,
}) => {
  const [isMetadataDialogOpen, setIsMetadataDialogOpen] = useState(false)

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)

  const isMounted = useIsMounted()

  const { t } = useTranslation()

  const listCard = useMemo(() => {
    return project && card ? findCard(project.cards, card?.key) : undefined
  }, [project, card])

  const childAmount = useMemo(() => {
    return listCard ? countChildren(listCard) : 0
  }, [listCard])

  const handleDelete = useCallback(async () => {
    if (onDelete && card) {
      onDelete(card.key, () => {
        if (isMounted) {
          setIsDeleteDialogOpen(false)
        }
      })
    }
  }, [onDelete, card])

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
        onDelete={handleDelete}
        warning={
          childAmount > 1
            ? t('deleteCardWarning', { cardAmount: childAmount })
            : undefined
        }
        content={
          <Trans
            i18nKey="deleteCardContent"
            values={{
              card: card?.key,
            }}
            count={childAmount}
            components={{
              bold: <Typography fontWeight="bold" />,
            }}
          />
        }
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
