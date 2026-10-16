// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

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
