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

import { useContext, useEffect } from 'react';
import { useSWRConfig } from 'swr';
import { useTranslation } from 'react-i18next';
import { UserRole, useHasMinRole } from '@/lib/auth';
import { ProjectEventsContext, type PresenceEntry } from './presence.js';
import { useUser } from './user.js';
import { projectApiPaths } from '../swr.js';
import { useAppDispatch } from '../hooks/index.js';
import { addNotification } from '../slices/notifications.js';

/** Refetches the open card after a remote write; only editors are told who made it. */
export function useCardUpdates(
  cardKey: string | null,
  mode: PresenceEntry['mode'],
  projectPrefix?: string,
) {
  const { subscribeToCardUpdates } = useContext(ProjectEventsContext);
  const { mutate } = useSWRConfig();
  const { user } = useUser();
  const canEdit = useHasMinRole(UserRole.Editor);
  const dispatch = useAppDispatch();
  const { t } = useTranslation();
  useEffect(() => {
    const paths = projectApiPaths(projectPrefix);
    return subscribeToCardUpdates((event) => {
      if (!cardKey || event.cardKey !== cardKey) return;
      void mutate(paths.card(cardKey));
      void mutate(paths.rawCard(cardKey));
      void mutate(paths.tree());
      if (event.userId === user?.id || !canEdit) return;
      dispatch(
        addNotification({
          message: t(
            mode === 'editing'
              ? 'presence.updatedWhileEditing'
              : 'presence.updatedByOther',
            { user: event.userName },
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
    mutate,
    user?.id,
    canEdit,
    dispatch,
    t,
  ]);
}
