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
import {
  ProjectEventsContext,
  type PresenceEntry,
} from '@/lib/contexts/ProjectEventsContext';

export type { PresenceEntry };

/** Reports this view on the project stream and returns who else is on the card. */
export function usePresence(
  cardKey: string | null,
  mode: PresenceEntry['mode'] = 'viewing',
): PresenceEntry[] {
  const { presence, reportPresence } = useContext(ProjectEventsContext);
  useEffect(
    () => reportPresence(cardKey, mode),
    [cardKey, mode, reportPresence],
  );
  return cardKey ? (presence[cardKey] ?? []) : [];
}
