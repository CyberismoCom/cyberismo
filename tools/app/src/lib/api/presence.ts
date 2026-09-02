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

import { useEffect, useRef, useState } from 'react';
import { mutate } from 'swr';
import { useTranslation } from 'react-i18next';
import { getConfig } from '@/lib/utils';
import { projectApiPaths } from '@/lib/swr.js';
import { useAppDispatch } from '@/lib/hooks';
import { addNotification } from '@/lib/slices/notifications';
import { useUser } from './user';
import { z } from 'zod';

const presenceEntrySchema = z.object({
  userId: z.string(),
  userName: z.string(),
  mode: z.enum(['viewing', 'editing']),
});

const presenceEventSchema = z.object({
  editors: z.array(presenceEntrySchema),
});

const cardUpdatedEventSchema = z.object({
  cardKey: z.string(),
  userId: z.string(),
  userName: z.string(),
});

export type PresenceEntry = z.infer<typeof presenceEntrySchema>;

/**
 * Hook that connects to the card presence SSE endpoint.
 * Returns a list of users currently viewing or editing the card.
 *
 * The same stream carries `card-updated` events. On one, the card's SWR
 * entries are revalidated and, unless the writer is the current user, a
 * notification is shown: info while viewing, warning while editing.
 *
 * @param cardKey - The card to track presence for
 * @param mode - Whether the current user is 'viewing' or 'editing'
 */
export function usePresence(
  cardKey: string | null,
  mode: 'viewing' | 'editing' = 'viewing',
  projectPrefix?: string,
): PresenceEntry[] {
  const [editors, setEditors] = useState<PresenceEntry[]>([]);
  const { user } = useUser();
  const dispatch = useAppDispatch();
  const { t } = useTranslation();
  const config = getConfig();
  const isEnabled = !config.staticMode && !!config.presenceEnabled;
  const url =
    cardKey && isEnabled
      ? projectApiPaths(projectPrefix).presence(cardKey, mode)
      : null;

  // Read through a ref so a late-arriving user id does not reconnect the stream.
  const userIdRef = useRef(user?.id);
  useEffect(() => {
    userIdRef.current = user?.id;
  }, [user?.id]);

  useEffect(() => {
    if (!url || !cardKey) {
      return;
    }

    const apiPaths = projectApiPaths(projectPrefix);
    const refetchCard = () => {
      mutate(apiPaths.card(cardKey));
      mutate(apiPaths.rawCard(cardKey));
    };

    const eventSource = new EventSource(url);
    let openedBefore = false;

    eventSource.addEventListener('open', () => {
      // Writes made while disconnected were never delivered.
      if (openedBefore) refetchCard();
      openedBefore = true;
    });

    eventSource.addEventListener('presence', (event) => {
      try {
        const data = presenceEventSchema.parse(JSON.parse(event.data));
        setEditors(data.editors);
      } catch (e) {
        console.warn('Malformed presence event', e);
      }
    });

    eventSource.addEventListener('card-updated', (event) => {
      let data: z.infer<typeof cardUpdatedEventSchema>;
      try {
        data = cardUpdatedEventSchema.parse(JSON.parse(event.data));
      } catch (e) {
        console.warn('Malformed card-updated event', e);
        return;
      }
      refetchCard();
      if (data.userId === userIdRef.current) return;
      dispatch(
        addNotification(
          mode === 'editing'
            ? {
                message: t('presence.updatedWhileEditing', {
                  user: data.userName,
                }),
                type: 'warning',
              }
            : {
                message: t('presence.updatedByOther', { user: data.userName }),
                type: 'info',
              },
        ),
      );
    });

    eventSource.addEventListener('error', () => {
      // EventSource will auto-reconnect; clear state on error
      setEditors([]);
    });
    const handlePageHide = () => {
      eventSource.close();
    };
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      eventSource.close();
      setEditors([]);
    };
  }, [url, cardKey, projectPrefix, mode, dispatch, t]);

  return editors;
}
