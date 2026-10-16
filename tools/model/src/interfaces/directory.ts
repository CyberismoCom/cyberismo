/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2026

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

/** A project of a directory, as its list gives it. */
export interface ProjectSummary {
  prefix: string;
  name: string;
  category?: string;
  description?: string;
}

/** What a new project is created with. */
export interface CreateProjectParams {
  name: string;
  prefix: string;
  category?: string;
  description?: string;
  skipDefaultHub?: boolean;
}

/**
 * A created project. `failures` are steps after its files were written that
 * did not happen (the default hub not added); `warnings` did not stop
 * anything (a hub not fetched).
 */
export interface CreateProjectResult {
  path: string;
  prefix: string;
  failures: string[];
  warnings: string[];
}

/** The projects a clone added, and the prefixes it skipped as present. */
export interface CloneProjectResult {
  projects: { prefix: string; name: string }[];
  skippedDuplicates?: string[];
}
