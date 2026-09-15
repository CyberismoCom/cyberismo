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

import { createContext, useContext, useEffect } from 'react';

export interface PresenceEntry {
  userId: string;
  userName: string;
  mode: 'viewing' | 'editing';
}

export const ProjectEventsContext = createContext<{
  presence: Record<string, PresenceEntry[]>;
  reportPresence: (
    cardKey: string | null,
    mode: PresenceEntry['mode'],
  ) => () => void;
}>({
  presence: {},
  reportPresence: () => () => {},
});

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
