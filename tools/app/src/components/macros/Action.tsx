// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { Button, Tooltip } from '@mui/joy';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { ActionButtonOptions } from '@cyberismo/model';
import type { MacroContext } from '.';
import { ActionLostError, useCardMutations } from '@/lib/api';
import { UserRole, useHasMinRole } from '@/lib/auth';
import { useAppDispatch, useAppSelector } from '@/lib/hooks';
import { addNotification } from '@/lib/slices/notifications';
import { selectProjectPrefix } from '@/lib/slices/project';
import { ApiCallError } from '@/lib/swr';

// At most this many created cards are linked in the success toast.
const LINKS_SHOWN = 10;

export type ActionProps = ActionButtonOptions & MacroContext;

// The message of a failed click.
function failureMessage(error: unknown, t: TFunction): string {
  if (error instanceof ActionLostError) {
    return t(
      error.refreshed ? 'action.lostRefreshed' : 'action.lostNotRefreshed',
    );
  }
  // A busy server without a program in the details changed nothing, so the
  // click can be retried. A later program's failure names the program, and
  // its message says what was kept.
  if (
    error instanceof ApiCallError &&
    error.response.status === 503 &&
    error.details?.program === undefined
  ) {
    const seconds = Number(error.response.headers.get('Retry-After'));
    return Number.isInteger(seconds) && seconds > 0
      ? t('action.busyIn', { count: seconds })
      : t('action.busy');
  }
  return error instanceof Error ? error.message : t('unknownError');
}

export default function Action({
  buttonLabel,
  cardKey,
  programs,
  preview,
}: ActionProps) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const canEdit = useHasMinRole(UserRole.Editor);
  const prefix = useAppSelector(selectProjectPrefix);
  const { runAction, isUpdating } = useCardMutations(cardKey);
  const running = isUpdating('action');
  const blocked = !canEdit;

  const run = async () => {
    if (blocked || running) return;
    if (preview) {
      dispatch(
        addNotification({ message: t('action.preview'), type: 'success' }),
      );
      return;
    }
    try {
      const { created } = (await runAction(programs))!;
      if (created.length === 0) {
        dispatch(
          addNotification({ message: t('action.ran'), type: 'success' }),
        );
        return;
      }
      const more = created.length - LINKS_SHOWN;
      dispatch(
        addNotification({
          message: t('action.created', { count: created.length }),
          type: 'success',
          links: created.slice(0, LINKS_SHOWN).map(({ key, title }) => ({
            label: title || key,
            href: `/projects/${prefix}/cards/${key}`,
          })),
          ...(more > 0 && { more: t('action.more', { count: more }) }),
        }),
      );
    } catch (error) {
      dispatch(
        addNotification({
          message: failureMessage(error, t),
          type: 'error',
        }),
      );
    }
  };

  return (
    // aria-disabled keeps the button focusable so the reason is reachable
    <Tooltip
      title={blocked ? t('permissions.editorRequired') : ''}
      describeChild
    >
      <Button
        loading={running}
        aria-disabled={blocked || undefined}
        sx={(theme) =>
          blocked
            ? {
                ...theme.variants.solidDisabled.primary,
                '&:hover': theme.variants.solidDisabled.primary,
                cursor: 'not-allowed',
              }
            : {}
        }
        onClick={run}
      >
        {buttonLabel}
      </Button>
    </Tooltip>
  );
}
