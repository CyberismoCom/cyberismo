/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2025
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

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
