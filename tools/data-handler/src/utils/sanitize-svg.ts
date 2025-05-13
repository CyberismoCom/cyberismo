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
 * Sanitize an SVG Buffer and return a base64-encoded string
 * @param buffer - SVG content as a Buffer
 * @returns base64-encoded sanitized SVG string
 */
export function sanitizeSvgBase64(buffer: Buffer): string {
  const DOMPurify = createDOMPurify(window as unknown as WindowLike);

  const dirty = buffer.toString('utf-8');

  DOMPurify.setConfig({ USE_PROFILES: { svg: true } });
  DOMPurify.addHook('afterSanitizeAttributes', removeSvgWidthAndHeight);

  let cleaned = DOMPurify.sanitize(dirty);

  // Remove link titles, quick fix for Clingraph/Graphviz generated titles for links that are quite strange
  cleaned = cleaned.replace(/\s*xlink:title=(["']).*?\1/g, '');

  return Buffer.from(cleaned, 'utf-8').toString('base64');
}
