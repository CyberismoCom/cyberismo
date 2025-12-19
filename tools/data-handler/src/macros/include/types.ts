/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2025

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
 * Include macro options.
 * @param cardKey Card key of the card being included
 * @param levelOffset A positive number wil increase the level of headings.
 *                    A negative value will the level of headings in the included content.
 * @param title Determines behaviour with the title that is in card metadata
 *              include --> includes the title
 *              exclude --> excludes the title
 *              only --> includes title but does not import content
 * @param trim If true, trims leading and trailing whitespace
 * @param escape Type of escaping to apply to the included content
 *               json --> escapes for JSON strings
 *               csv --> escapes for CSV fields
 */
export interface IncludeMacroOptions {
  cardKey: string;
  levelOffset?: string;
  title?: 'include' | 'exclude' | 'only';
  pageTitles?: 'normal' | 'discrete';
  trim?: boolean;
  escape?: 'json' | 'csv';
}
