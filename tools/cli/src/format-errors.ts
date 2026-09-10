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

// How many validation errors are shown when staring app, if any.
const VALIDATION_ERROR_ROW_LIMIT = 10;

// Truncates a multi-row message to an array of items.
// Logs maximum of 'limit' items to console. If there are more items than
// 'limit', the last element is replaced with "..." to indicate truncation.
// Returns the potentially truncated array.
export function truncateMessage(
  messages: string,
  limit: number = VALIDATION_ERROR_ROW_LIMIT,
): string[] {
  const array = messages.split('\n');
  if (array.length < limit) {
    return [...array];
  }
  if (limit <= 0) {
    return [];
  }
  if (limit === 1) {
    return ['...'];
  }
  return [...array.slice(0, limit - 1), '...'];
}

// Groups export errors by project prefix for CLI display, matching the
// "Validation errors in project '<name>':" convention used at CLI startup.
export function formatExportErrors(
  errors: { prefix?: string; error: string }[],
): string {
  const grouped = new Map<string, string[]>();
  for (const { prefix, error } of errors) {
    const key = prefix ?? 'unknown project';
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(error);
  }
  const lines: string[] = [];
  for (const [prefix, messages] of grouped) {
    lines.push(`Errors in project '${prefix}':`);
    lines.push(...truncateMessage(messages.join('\n')));
  }
  return lines.join('\n');
}
