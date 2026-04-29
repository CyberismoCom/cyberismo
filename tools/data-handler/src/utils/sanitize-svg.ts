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

// Extra tags and attributes needed beyond the default SVG profile:
// - foreignObject: used by Mermaid v11 and other tools to embed HTML text labels inside SVG
// - div/span/p/b/i/em/strong/br: HTML elements that appear inside <foreignObject>
// - dominant-baseline: SVG text attribute used by scoreCard and other SVG generators
// HTML_INTEGRATION_POINTS tells DOMPurify that HTML elements inside <foreignObject> are valid
const SVG_EXTRA_CONFIG = {
  USE_PROFILES: { svg: true },
  ADD_TAGS: ['foreignobject', 'div', 'span', 'p', 'b', 'i', 'em', 'strong', 'br'],
  ADD_ATTR: ['class', 'style', 'xmlns', 'dominant-baseline'],
  HTML_INTEGRATION_POINTS: { foreignobject: true },
};

// Prevents use of global hooks
const purifyRemoveSize = createDOMPurify(window as unknown as WindowLike);
purifyRemoveSize.setConfig(SVG_EXTRA_CONFIG);
purifyRemoveSize.addHook('afterSanitizeAttributes', removeSvgWidthAndHeight);

const purifyKeepSize = createDOMPurify(window as unknown as WindowLike);
purifyKeepSize.setConfig(SVG_EXTRA_CONFIG);

/**
 * Sanitize an SVG string and return a base64-encoded string
 * @param svg - SVG content as a string
 * @param options - Options for sanitization
 * @param options.removeSize - Whether to remove width/height from the SVG element (default: true)
 * @returns base64-encoded sanitized SVG string
 */
export function sanitizeSvgBase64(
  svg: string,
  options?: { removeSize?: boolean },
): string {
  const { removeSize = true } = options ?? {};
  const cleaned = (removeSize ? purifyRemoveSize : purifyKeepSize).sanitize(
    svg,
  );
  return Buffer.from(cleaned, 'utf-8').toString('base64');
}
