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

import { useParams } from 'react-router';
import { useAvailableProjects, useUser } from '@/lib/api';
import { getConfig } from '@/lib/utils';
import { UserRole, parseRole, roleSatisfies } from './roles';

/**
 * Whether an operator has marked the project being viewed read-only.
 *
 * A tenant-wide setting arrives as a reader role instead, so it needs no
 * handling here.
 */
function useCurrentProjectReadOnly(): boolean {
  const { projectPrefix } = useParams();
  const { data } = useAvailableProjects();
  if (getConfig().staticMode || !projectPrefix) return false;
  return (
    data?.projects.find((project) => project.prefix === projectPrefix)
      ?.readOnly === true
  );
}

export function useHasMinRole(minRole: UserRole): boolean {
  const { user } = useUser();
  const readOnly = useCurrentProjectReadOnly();
  if (!user) return false;
  const role = parseRole(user.role);
  // Administrators keep editing: they are how a freeze gets lifted.
  const effective =
    readOnly && role !== UserRole.Admin ? UserRole.Reader : role;
  return roleSatisfies(effective, minRole);
}
