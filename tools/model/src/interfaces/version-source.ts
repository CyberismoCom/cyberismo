// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

/** Where a module's versions come from, as reported to callers. */
export type VersionSource = 'git' | 'file' | 'private';

/** A location a module can be fetched from; `private` defaults to false. */
export interface Source {
  location: string;
  private?: boolean;
}
