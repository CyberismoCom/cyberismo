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

/**
 * Module failures a caller can act on, as opposed to the internal faults that
 * are only ever a bug or a broken environment. Callers that speak a protocol
 * of their own — the HTTP API above all — translate these into their own
 * vocabulary instead of reporting an unexplained failure.
 */

/** A module the project does not declare as a root of its own. */
export class ModuleNotDeclaredError extends Error {
  /**
   * @param parents Installed modules that require the module; empty when the
   * project neither declares nor installs it at all.
   */
  constructor(
    message: string,
    public readonly parents: string[],
  ) {
    super(message);
    this.name = 'ModuleNotDeclaredError';
  }
}

/** An explicit target version the project or its source refuses. */
export class ModuleVersionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModuleVersionError';
  }
}
