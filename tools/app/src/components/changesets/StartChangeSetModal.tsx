/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { useState } from 'react';
import {
  Button,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormLabel,
  Input,
  Modal,
  ModalDialog,
  Typography,
} from '@mui/joy';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { useAppDispatch } from '@/lib/hooks';
import { addNotification } from '@/lib/slices/notifications';
import { startChangeSet } from '@/lib/api/changesets';

/** Asks for a title, then starts a changeSet and works in it. */
export function StartChangeSetModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { projectPrefix } = useParams();
  const dispatch = useAppDispatch();
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);

  const start = async () => {
    const trimmed = title.trim();
    if (!projectPrefix || !trimmed) return;
    setBusy(true);
    try {
      await startChangeSet(projectPrefix, trimmed);
      dispatch(
        addNotification({
          message: t('changeSet.started', { title: trimmed }),
          type: 'success',
        }),
      );
      setTitle('');
      onClose();
    } catch (error) {
      dispatch(
        addNotification({
          message: error instanceof Error ? error.message : String(error),
          type: 'error',
        }),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog sx={{ width: 480, maxWidth: '100%' }}>
        <DialogTitle>{t('changeSet.startTitle')}</DialogTitle>
        <DialogContent>
          <Typography level="body-sm">
            {t('changeSet.startDescription')}
          </Typography>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void start();
            }}
          >
            <FormControl sx={{ mt: 2 }}>
              <FormLabel>{t('changeSet.titleLabel')}</FormLabel>
              <Input
                autoFocus
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                slotProps={{ input: { maxLength: 200 } }}
              />
            </FormControl>
            <DialogActions>
              <Button type="submit" loading={busy} disabled={!title.trim()}>
                {t('changeSet.start')}
              </Button>
              <Button variant="plain" color="neutral" onClick={onClose}>
                {t('cancel')}
              </Button>
            </DialogActions>
          </form>
        </DialogContent>
      </ModalDialog>
    </Modal>
  );
}
