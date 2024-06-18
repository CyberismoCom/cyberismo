import { Alert, Snackbar, IconButton } from '@mui/joy'
import React from 'react'
import { CloseRounded } from '@mui/icons-material'

interface ErrorBarProps {
  error: Error | string | null
  onClose: (event?: React.SyntheticEvent | Event, reason?: string) => void
}

function ErrorBar({ error, onClose }: ErrorBarProps) {
  return (
    <Snackbar open={error !== null} autoHideDuration={2000}>
      <Alert
        color="danger"
        sx={{ width: '100%' }}
        endDecorator={
          <IconButton
            variant="plain"
            size="sm"
            color="neutral"
            onClick={onClose}
          >
            <CloseRounded />
          </IconButton>
        }
      >
        {error instanceof Error ? error.message : error}
      </Alert>
    </Snackbar>
  )
}

export default ErrorBar
