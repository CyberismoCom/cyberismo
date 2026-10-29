// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import {
  AppModalsContext,
  type AppModalsContextValue,
} from './AppModalsContext';

export function AppModalsProvider({
  value,
  children,
}: {
  value: AppModalsContextValue;
  children: React.ReactNode;
}) {
  return (
    <AppModalsContext.Provider value={value}>
      {children}
    </AppModalsContext.Provider>
  );
}
