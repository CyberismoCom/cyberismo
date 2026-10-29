// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { createContext } from 'react';

export interface PresenceEntry {
  userId: string;
  userName: string;
  mode: 'viewing' | 'editing';
}

export interface CardUpdatedEvent {
  cardKey: string;
  userId?: string;
  userName?: string;
}

export const ProjectEventsContext = createContext<{
  presence: Record<string, PresenceEntry[]>;
  disconnected: boolean;
  reportPresence: (
    cardKey: string | null,
    mode: PresenceEntry['mode'],
  ) => () => void;
  subscribeToCardUpdates: (
    listener: (event: CardUpdatedEvent) => void,
  ) => () => void;
}>({
  presence: {},
  disconnected: false,
  reportPresence: () => () => {},
  subscribeToCardUpdates: () => () => {},
});
