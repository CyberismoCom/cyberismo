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
 * Options for the image macro.
 * @param fileName - Name of the file to include.
 * @param cardKey - Key of the card to include the file from.
 * @param alt - Alternative text for the image.
 * @param title - Title of the image.
 */
export interface ImageMacroOptions {
  /**
   * Filename of the image
   */
  fileName: string;
  /**
   * By default, image is assumed to be under the current card. You can override this behaviour
   */
  cardKey?: string;
  /**
   * Alt text
   */
  alt?: string;
  /**
   * Title for the image
   */
  title?: string;
}
