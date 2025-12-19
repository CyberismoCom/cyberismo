/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { readFile } from 'node:fs/promises';
import { parse } from 'csv-parse/sync';
import type { CSVRowRaw } from '../interfaces/project-interfaces.js';

/**
 * Escapes a string for use as a CSV field.
 * Escapes double quotes by doubling them and wraps the field in quotes if it contains
 * special characters (comma, newline, or double quote).
 * @param str The string to escape
 * @returns The escaped string suitable for use in CSV
 */
export function escapeCsvField(str: string): string {
  // Check if the field needs to be quoted (contains comma, newline, or double quote)
  const needsQuoting = /[,\n\r"]/.test(str);

  // Escape double quotes by doubling them
  const escaped = str.replace(/"/g, '""');

  // Wrap in quotes if necessary
  return needsQuoting ? `"${escaped}"` : escaped;
}

/**
 * Reads a CSV file and returns its content as an array of objects.
 * @param file Path to the CSV file.
 * @returns Array of objects. Each object represents a row in the CSV file.
 */
export async function readCsvFile(file: string): Promise<CSVRowRaw[]> {
  const content = await readFile(file, {
    encoding: 'utf-8',
  });
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
