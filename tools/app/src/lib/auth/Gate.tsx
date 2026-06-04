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
