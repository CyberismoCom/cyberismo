// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { createContext, useContext } from 'react';
import type { ResourceName } from '@/lib/constants';

export type AppModalsContextValue = {
  openCreateResourceModal: (resourceType: ResourceName) => void;
};

export const AppModalsContext = createContext<AppModalsContextValue | null>(
  null,
);

export function useAppModals() {
  const ctx = useContext(AppModalsContext);
  if (!ctx) {
    throw new Error('useAppModals must be used within an AppModalsProvider');
  }
  return ctx;
}
