/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

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

/**
 * Refetches the open card after a remote write; only editors are told who made
 * it. Writes by an agent are announced even when the agent acted for this user.
 */
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
      if (!cardKey || event.cardKey !== cardKey) return;
      void mutate(apiPaths.card(cardKey));
      void mutate(apiPaths.rawCard(cardKey));
      void mutate(apiPaths.tree());
      // An agent acting for this user is still news to them
      const byAgent = event.actor === 'agent';
      if ((event.userId === user?.id && !byAgent) || !canEdit) return;
      const key = mode === 'editing' ? 'whileEditing' : 'byOther';
      dispatch(
        addNotification({
          message: t(`cardUpdated.${key}${byAgent ? 'ByAgent' : ''}`, {
            name: event.userName,
          }),
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
