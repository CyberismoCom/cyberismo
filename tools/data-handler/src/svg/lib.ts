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
import pixelWidth from 'string-pixel-width';

/**
 * Measures the width of a text string
 * @param text - The text to measure
 * @param font - The font to use
 * @param size - The size of the font
 * @param bold - Whether the text is bold
 * @returns The width of the text
 */
export function measureTextWidth(
  text: string,
  font: string,
  size: number,
  bold = false,
): number {
  return pixelWidth(text, { font, size, bold });
}
