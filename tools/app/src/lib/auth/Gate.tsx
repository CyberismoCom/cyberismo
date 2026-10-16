// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { ReactNode } from 'react';
import type { UserRole } from './roles';
import { useHasMinRole } from './usePermissions';

interface GateProps {
  minRole: UserRole;
  fallback?: ReactNode;
  children: ReactNode;
}

export function Gate({ minRole, fallback = null, children }: GateProps) {
  return useHasMinRole(minRole) ? <>{children}</> : <>{fallback}</>;
}
