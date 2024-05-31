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
        <MenuItem onClick={handleMetadataDialogOpen}>Metadata</MenuItem>
        <Divider />
        <MenuItem onClick={handleClose}>
          <Typography color="red">Delete card</Typography>
        </MenuItem>
      </Menu>

      <Dialog open={isMetadataDialogOpen} onClose={handleMetadataDialogClose}>
        <Box>
          <DialogTitle id="metadata-modal-title" variant="h6" component="h2">
            {card?.key} metadata
          </DialogTitle>
          <DialogContent>
            <DialogContentText id="metadata-dialog-content">
              {renderMetadata(card?.metadata)}
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleMetadataDialogClose} autoFocus>
              Close
            </Button>
          </DialogActions>
        </Box>
      </Dialog>
    </div>
  )
}

const renderMetadata = (metadata?: CardMetadata) => (
  <div>
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell>
            <b>Name</b>
          </TableCell>
          <TableCell>
            <b>Value</b>
          </TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        <TableRow>
          <TableCell>Card type</TableCell>
          <TableCell>{metadata?.cardtype}</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>Summary</TableCell>
          <TableCell>{metadata?.summary}</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>Workflow state</TableCell>
          <TableCell>{metadata?.workflowState}</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </div>
)

export default CardContextMenu
