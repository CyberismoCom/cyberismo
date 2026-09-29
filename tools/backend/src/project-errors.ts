/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

export interface ProjectErrors {
  prefix: string;
  errors: string[];
}

/** Formats errors as one block per project, capping each at `limit` lines. */
export function formatProjectErrors(
  groups: ProjectErrors[],
  limit: number = 10,
): string {
  const heading = `${groups.length} ${groups.length === 1 ? 'project has' : 'projects have'} errors:`;
  const blocks = groups.map(({ prefix, errors }) => {
    const lines = errors.slice(0, limit).map((e) => `  ${e}`);
    if (errors.length > limit) {
      lines.push(`  … ${errors.length - limit} more`);
    }
    return `${prefix} (${errors.length}):\n${lines.join('\n')}`;
  });
  return [heading, ...blocks].join('\n\n');
}
