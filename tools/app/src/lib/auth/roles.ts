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

export enum UserRole {
  Reader = 0,
  Editor = 1,
  Admin = 2,
}

const ROLE_MAP: Record<string, UserRole> = {
  reader: UserRole.Reader,
  editor: UserRole.Editor,
  admin: UserRole.Admin,
};

export function parseRole(raw: string | undefined | null): UserRole | null {
  if (!raw) return null;
  return ROLE_MAP[raw.toLowerCase()] ?? null;
}

export function roleSatisfies(
  userRole: UserRole | null,
  minRole: UserRole,
): boolean {
  return userRole != null && userRole >= minRole;
}
