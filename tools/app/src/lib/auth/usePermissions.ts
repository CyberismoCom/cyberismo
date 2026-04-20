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

import { useUser } from '@/lib/api';
import { getConfig } from '@/lib/utils';
import { UserRole, parseRole, roleSatisfies } from './roles';

export function useHasRole(minRole: UserRole): boolean {
  const { user } = useUser();
  if (getConfig().staticMode) return false;
  if (!user) return false;
  return roleSatisfies(parseRole(user.role), minRole);
}

export const useCanEdit = () => useHasRole(UserRole.Editor);
export const useCanAdmin = () => useHasRole(UserRole.Admin);
