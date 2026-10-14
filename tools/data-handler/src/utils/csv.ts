/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { parse } from 'csv-parse/sync';
import type { CSVRowRaw } from '@cyberismo/model';

/**
 * Escapes a string for use as a CSV field.
 * Escapes double quotes by doubling them. The caller is responsible for
 * wrapping the result in quotes.
 * @param str The string to escape
 * @returns The escaped string (without surrounding quotes)
 */
export function escapeCsvField(str: string): string {
  // Escape double quotes by doubling them
  return str.replace(/"/g, '""');
}

/**
 * Parses CSV text into an array of objects, one per row, keyed by header.
 */
export function parseCsv(content: string): CSVRowRaw[] {
  const records = parse(content, {
    bom: true,
  });

  if (!Array.isArray(records) || records.length < 2) {
    throw new Error('CSV file must have headers');
  }

  const [headers, ...data] = records;

  if (
    !Array.isArray(headers) ||
    new Set(headers).size !== headers.length ||
    headers.length === 0
  ) {
    throw new Error('Error parsing header');
  }

  return data.map((row) => {
    if (!Array.isArray(row)) {
      throw new Error('Row is not an array');
    }
    return headers.reduce((acc: Record<string, string>, header, index) => {
      acc[header] = row[index];
      return acc;
    }, {});
  });
}
