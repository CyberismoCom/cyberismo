// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

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
