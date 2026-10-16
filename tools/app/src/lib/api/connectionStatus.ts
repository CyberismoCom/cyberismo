// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { useContext } from 'react';
import { ProjectEventsContext } from '@/lib/contexts/ProjectEventsContext';

/** True once the project stream has missed enough heartbeats to be considered stale. */
export function useConnectionStatus(): boolean {
  return useContext(ProjectEventsContext).disconnected;
}
