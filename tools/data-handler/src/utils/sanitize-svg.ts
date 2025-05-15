/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { Buffer } from 'buffer';

/**
 * Removes a specific attribute from an element in an SVG string
 * @param svg - The SVG string to modify
 * @param element - The element to target (e.g., 'svg')
 * @param attribute - The attribute to remove (e.g., 'width')
 * @returns Modified SVG string with the attribute removed
 */
const removeAttribute = (
  svg: string,
  element: string,
  attribute: string,
): string => {
  const pattern = new RegExp(
    `<${element}((?:[^>]*?(?!${attribute}=["']))*?)(\\s+${attribute}=["'][^"']*["'])([^>]*)>`,
    'g',
  );
  return svg.replace(pattern, `<${element}$1$3>`);
};

/**
 * Sanitize an SVG string and return a base64-encoded string
 * @param svg - SVG content as a string
 * @returns base64-encoded sanitized SVG string
 */
export function sanitizeSvgBase64(svg: string): string {
  // Remove SVG size attributes to make it scale in the application properly
  svg = removeAttribute(svg, 'svg', 'width');
  svg = removeAttribute(svg, 'svg', 'height');

  return Buffer.from(svg, 'utf-8').toString('base64');
}
