/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import createDOMPurify, { type WindowLike } from 'dompurify';
import { Buffer } from 'buffer';
import { JSDOM } from 'jsdom';

const window = new JSDOM('').window as unknown as Window;

// Remove SVG size to make it scale in the application properly
const removeSvgWidthAndHeight = (node: Element) => {
  if (node.nodeName === 'svg') {
    node.removeAttribute('width');
    node.removeAttribute('height');
  }
};

/**
 * Sanitize an SVG string and return a base64-encoded string
 * @param svg - SVG content as a string
 * @returns base64-encoded sanitized SVG string
 */
export function sanitizeSvgBase64(svg: string): string {
  const DOMPurify = createDOMPurify(window as unknown as WindowLike);

  DOMPurify.setConfig({ USE_PROFILES: { svg: true } });
  DOMPurify.addHook('afterSanitizeAttributes', removeSvgWidthAndHeight);

  const cleaned = DOMPurify.sanitize(svg);

  return Buffer.from(cleaned, 'utf-8').toString('base64');
}
