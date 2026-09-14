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

import { createContext } from 'react';

export interface PresenceEntry {
  userId: string;
  userName: string;
  mode: 'viewing' | 'editing';
}

export interface CardUpdatedEvent {
  cardKey: string;
  userId: string;
  userName: string;
}

export const ProjectEventsContext = createContext<{
  presence: Record<string, PresenceEntry[]>;
  subscribeToCardUpdates: (
    listener: (event: CardUpdatedEvent) => void,
  ) => () => void;
  reportPresence: (
    cardKey: string | null,
    mode: 'viewing' | 'editing',
  ) => () => void;
}>({
  presence: {},
  reportPresence: () => () => {},
  subscribeToCardUpdates: () => () => {},
});
