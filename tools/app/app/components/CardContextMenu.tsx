import * as React from 'react'
import MoreIcon from '@mui/icons-material/MoreHoriz'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import IconButton from '@mui/material/IconButton'
import Divider from '@mui/material/Divider'
import Typography from '@mui/material/Typography'
import Modal from '@mui/material/Modal'
import Box from '@mui/material/Box'
import { useState } from 'react'
import { CardDetails, CardMetadata } from '../lib/definitions'
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from '@mui/material'
import { useTranslation } from 'react-i18next'

interface CardContextMenuProps {
  card: CardDetails | null
}

const CardContextMenu: React.FC<CardContextMenuProps> = ({ card }) => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const open = Boolean(anchorEl)

  const [isMetadataDialogOpen, setIsMetadataDialogOpen] = useState(false)

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget)
  }
  const handleClose = () => {
    setAnchorEl(null)
  }
  const handleMetadataDialogOpen = () => {
    setIsMetadataDialogOpen(true)
    handleClose()
  }

  const handleMetadataDialogClose = () => {
    setIsMetadataDialogOpen(false)
  }

  const { t } = useTranslation()

  return (
    <div>
      <IconButton
        id="context-button"
        aria-controls={open ? 'context-menu' : undefined}
        aria-haspopup="true"
        aria-expanded={open ? 'true' : undefined}
        onClick={handleClick}
      >
        <MoreIcon />
      </IconButton>
      <Menu
        id="context-menu"
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        MenuListProps={{
          'aria-labelledby': 'context-button',
        }}
      >
        <MenuItem onClick={handleMetadataDialogOpen}>{t('metadata')}</MenuItem>
        <Divider />
        <MenuItem onClick={handleClose}>
          <Typography color="red">{t('deleteCard')}</Typography>
        </MenuItem>
      </Menu>

      <Dialog open={isMetadataDialogOpen} onClose={handleMetadataDialogClose}>
        <Box>
          <DialogTitle id="metadata-modal-title" variant="h6" component="h2">
            {card?.key} {t('metadata').toLowerCase()}
          </DialogTitle>
          <DialogContent>
            <DialogContentText id="metadata-dialog-content">
              {renderMetadata(t, card?.metadata)}
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleMetadataDialogClose} autoFocus>
              {t('close')}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>
    </div>
  )
}

const renderMetadata = (
  t: (key: string) => string,
  metadata?: CardMetadata
) => {
  return (
    <div>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>
              <b>{t('name')}</b>
            </TableCell>
            <TableCell>
              <b>{t('value')}</b>
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          <TableRow>
            <TableCell>{t('cardType')}</TableCell>
            <TableCell>{metadata?.cardtype}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>{t('summary')}</TableCell>
            <TableCell>{metadata?.summary}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>{t('workflowState')}</TableCell>
            <TableCell>{metadata?.workflowState}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  )
}

export default CardContextMenu
