// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { useContext, useEffect } from 'react';
import { mutate } from 'swr';
import { useTranslation } from 'react-i18next';
import { UserRole, useHasMinRole } from '@/lib/auth';
import {
  ProjectEventsContext,
  type PresenceEntry,
} from '@/lib/contexts/ProjectEventsContext';
import { useUser } from './user';
import { projectApiPaths } from '../swr';
import { useAppDispatch } from '../hooks';
import { addNotification } from '../slices/notifications';

/** Refetches a card after a remote write, plus the open card's content and
 * the tree; only editors of the open card are told who made it. */
export function useCardUpdates(
  cardKey: string | null,
  mode: PresenceEntry['mode'],
  projectPrefix?: string,
) {
  const { subscribeToCardUpdates } = useContext(ProjectEventsContext);
  const { user } = useUser();
  const canEdit = useHasMinRole(UserRole.Editor);
  const dispatch = useAppDispatch();
  const { t } = useTranslation();
  useEffect(() => {
    const apiPaths = projectApiPaths(projectPrefix);
    return subscribeToCardUpdates((event) => {
      // Unmounted keys fetch nothing, so other cards cost only what the page shows.
      void mutate(apiPaths.card(event.cardKey));
      if (!cardKey || event.cardKey !== cardKey) return;
      void mutate(apiPaths.cardContent(cardKey));
      void mutate(apiPaths.cardSource(cardKey));
      void mutate(apiPaths.tree());
      if (event.userId === user?.id || !canEdit || !event.userName) return;
      dispatch(
        addNotification({
          message: t(
            mode === 'editing'
              ? 'cardUpdated.whileEditing'
              : 'cardUpdated.byOther',
            { name: event.userName },
          ),
          type: mode === 'editing' ? 'warning' : 'info',
        }),
      );
    });
  }, [
    cardKey,
    mode,
    projectPrefix,
    subscribeToCardUpdates,
    user?.id,
    canEdit,
    dispatch,
    t,
  ]);
}
