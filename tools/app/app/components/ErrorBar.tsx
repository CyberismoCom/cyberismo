import { Alert, Snackbar } from '@mui/material';
import React from 'react';

interface ErrorBarProps {
    error: Error | string | null;
    onClose: (event?: React.SyntheticEvent | Event, reason?: string) => void;
}

const ErrorBar: React.FC<ErrorBarProps> = ({error, onClose}) => {
    return (
        <Snackbar open={error !== null} autoHideDuration={2000}>
            <Alert
                onClose={onClose}
                severity="error"
                variant="filled"
                sx={{ width: '100%' }}
            >
                {error instanceof Error ? error.message : error}
            </Alert>
      </Snackbar>
    )
}

export default ErrorBar;
