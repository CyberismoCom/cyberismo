/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2025

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { Box, Button, Chip, Stack, Tooltip, Typography } from '@mui/joy';
import { useCardSession, useSessionMutations } from '@/lib/api/sessions';
import { useAppDispatch } from '@/lib/hooks';
import { addNotification } from '@/lib/slices/notifications';
import { useTranslation } from 'react-i18next';

import CloudUpload from '@mui/icons-material/CloudUpload';
import Save from '@mui/icons-material/Save';
import PlayArrow from '@mui/icons-material/PlayArrow';
import Close from '@mui/icons-material/Close';
import Edit from '@mui/icons-material/Edit';

interface SessionStatusProps {
  cardKey: string;
  compact?: boolean;
}

/**
 * Component that displays the edit session status for a card and provides
 * session management actions (start, save, publish, discard).
 */
export default function SessionStatus({
  cardKey,
  compact = false,
}: SessionStatusProps) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();

  const { hasSession, session, isLoading, error } = useCardSession(cardKey);
  const { startSession, saveSession, publishSession, discardSession, isUpdating } =
    useSessionMutations(cardKey);

  const handleStart = async () => {
    try {
      await startSession();
      dispatch(
        addNotification({
          message: t('sessionStarted', 'Edit session started'),
          type: 'success',
        }),
      );
    } catch (err) {
      dispatch(
        addNotification({
          message: err instanceof Error ? err.message : t('sessionStartFailed', 'Failed to start session'),
          type: 'error',
        }),
      );
    }
  };

  const handleSave = async () => {
    if (!session) return;
    try {
      const result = await saveSession(session.id);
      if (result?.success) {
        dispatch(
          addNotification({
            message: t('sessionSaved', 'Changes saved'),
            type: 'success',
          }),
        );
      } else {
        dispatch(
          addNotification({
            message: result?.message || t('sessionSaveNoChanges', 'No changes to save'),
            type: 'success',
          }),
        );
      }
    } catch (err) {
      dispatch(
        addNotification({
          message: err instanceof Error ? err.message : t('sessionSaveFailed', 'Failed to save changes'),
          type: 'error',
        }),
      );
    }
  };

  const handlePublish = async () => {
    if (!session) return;
    try {
      const result = await publishSession(session.id);
      if (result?.success) {
        dispatch(
          addNotification({
            message: t('sessionPublished', 'Changes published'),
            type: 'success',
          }),
        );
      } else {
        dispatch(
          addNotification({
            message: result?.message || t('sessionPublishFailed', 'Failed to publish changes'),
            type: 'error',
          }),
        );
      }
    } catch (err) {
      dispatch(
        addNotification({
          message: err instanceof Error ? err.message : t('sessionPublishFailed', 'Failed to publish changes'),
          type: 'error',
        }),
      );
    }
  };

  const handleDiscard = async () => {
    if (!session) return;
    const confirmed = confirm(t('confirmDiscardSession', 'Are you sure you want to discard all changes in this session?'));
    if (!confirmed) return;

    try {
      await discardSession(session.id);
      dispatch(
        addNotification({
          message: t('sessionDiscarded', 'Session discarded'),
          type: 'success',
        }),
      );
    } catch (err) {
      dispatch(
        addNotification({
          message: err instanceof Error ? err.message : t('sessionDiscardFailed', 'Failed to discard session'),
          type: 'error',
        }),
      );
    }
  };

  if (isLoading) {
    return null; // Don't show anything while loading
  }

  if (error) {
    return null; // Silently fail if session check fails
  }

  // Compact mode: just show a status chip
  if (compact) {
    if (!hasSession) return null;
    return (
      <Tooltip title={t('editSessionActive', 'Edit session active')}>
        <Chip
          size="sm"
          variant="soft"
          color="warning"
          startDecorator={<Edit fontSize="small" />}
        >
          {t('editing', 'Editing')}
        </Chip>
      </Tooltip>
    );
  }

  // Full mode: show session actions
  if (!hasSession) {
    return (
      <Box>
        <Tooltip title={t('startSessionTooltip', 'Start an isolated edit session for this card')}>
          <Button
            size="sm"
            variant="outlined"
            color="primary"
            startDecorator={<PlayArrow />}
            loading={isUpdating('start')}
            onClick={handleStart}
          >
            {t('startSession', 'Start Edit Session')}
          </Button>
        </Tooltip>
      </Box>
    );
  }

  // Session is active - show session info and actions
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <Chip
        size="sm"
        variant="soft"
        color="warning"
        startDecorator={<Edit fontSize="small" />}
      >
        {t('sessionActive', 'Session Active')}
      </Chip>

      <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
        {session?.id.slice(0, 8)}...
      </Typography>

      <Tooltip title={t('saveSessionTooltip', 'Save (commit) current changes')}>
        <Button
          size="sm"
          variant="soft"
          color="neutral"
          startDecorator={<Save />}
          loading={isUpdating('save')}
          onClick={handleSave}
        >
          {t('save', 'Save')}
        </Button>
      </Tooltip>

      <Tooltip title={t('publishSessionTooltip', 'Publish changes to main branch')}>
        <Button
          size="sm"
          variant="solid"
          color="success"
          startDecorator={<CloudUpload />}
          loading={isUpdating('publish')}
          onClick={handlePublish}
        >
          {t('publish', 'Publish')}
        </Button>
      </Tooltip>

      <Tooltip title={t('discardSessionTooltip', 'Discard all changes and close session')}>
        <Button
          size="sm"
          variant="soft"
          color="danger"
          startDecorator={<Close />}
          loading={isUpdating('discard')}
          onClick={handleDiscard}
        >
          {t('discard', 'Discard')}
        </Button>
      </Tooltip>
    </Stack>
  );
}
