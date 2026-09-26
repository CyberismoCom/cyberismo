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
  Box,
  Button,
  DialogActions,
  DialogContent,
  DialogTitle,
  Modal,
  ModalDialog,
  Radio,
  RadioGroup,
  Stack,
  Typography,
} from '@mui/joy';
import { useTranslation } from 'react-i18next';
import type {
  ChangeSetConflict,
  ConflictResolution,
} from '@/lib/api/changesets';
import { TextDiff } from './CardChangeDiff';

/**
 * The files an update could not merge on its own: for each, keep the
 * changeSet's version or take the project's.
 */
export function ConflictsModal({
  conflicts,
  busy,
  onResolve,
  onClose,
}: {
  conflicts: ChangeSetConflict[];
  busy: boolean;
  onResolve: (resolutions: Record<string, ConflictResolution>) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [choices, setChoices] = useState<Record<string, 'ours' | 'theirs'>>({});
  const complete = conflicts.every((conflict) => choices[conflict.path]);
  return (
    <Modal open onClose={onClose}>
      <ModalDialog sx={{ width: 760, maxWidth: '100%' }}>
        <DialogTitle>{t('changeSet.conflictsTitle')}</DialogTitle>
        <DialogContent>
          <Typography level="body-sm">
            {t('changeSet.conflictsDescription')}
          </Typography>
          <Stack spacing={3} sx={{ mt: 2 }}>
            {conflicts.map((conflict) => (
              <Box key={conflict.path} data-cy="conflict">
                <Typography level="title-sm">
                  {conflict.key ?? conflict.path}
                  {conflict.fields?.length
                    ? ` — ${conflict.fields.join(', ')}`
                    : ''}
                </Typography>
                <Typography level="body-xs" sx={{ mb: 1 }}>
                  {conflict.path}
                </Typography>
                <TextDiff
                  before={conflict.theirs ?? ''}
                  after={conflict.ours ?? ''}
                />
                <Typography level="body-xs" sx={{ mt: 0.5 }}>
                  {t('changeSet.conflictLegend')}
                </Typography>
                <RadioGroup
                  orientation="horizontal"
                  value={choices[conflict.path] ?? ''}
                  onChange={(event) =>
                    setChoices({
                      ...choices,
                      [conflict.path]: event.target.value as 'ours' | 'theirs',
                    })
                  }
                  sx={{ mt: 1, gap: 2 }}
                >
                  <Radio value="ours" label={t('changeSet.keepOurs')} />
                  <Radio value="theirs" label={t('changeSet.takeTheirs')} />
                </RadioGroup>
              </Box>
            ))}
          </Stack>
          <DialogActions>
            <Button
              loading={busy}
              disabled={!complete}
              onClick={() => onResolve(choices)}
            >
              {t('changeSet.resolveAndUpdate')}
            </Button>
            <Button variant="plain" color="neutral" onClick={onClose}>
              {t('cancel')}
            </Button>
          </DialogActions>
        </DialogContent>
      </ModalDialog>
    </Modal>
  );
}
