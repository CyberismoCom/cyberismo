// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

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
