/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { readFile } from 'fs/promises';
import { parse } from 'csv-parse/sync';
import type { CSVRowRaw } from '../interfaces/project-interfaces.js';

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
    return headers.reduce((acc, header, index) => {
      acc[header] = row[index];
      return acc;
    }, {});
  });
}
