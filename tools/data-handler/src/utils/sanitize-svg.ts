/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import type { DOMPurify, WindowLike } from 'dompurify';
import { Buffer } from 'buffer';

// Remove SVG size to make it scale in the application properly
const removeSvgWidthAndHeight = (node: Element) => {
  if (node.nodeName === 'svg') {
    node.removeAttribute('width');
    node.removeAttribute('height');
  }
};

// DOMPurify config that preserves HTML content inside <foreignObject> elements.
// Mermaid and other tools render text labels as HTML inside foreignObject.
const SVG_PURIFY_CONFIG = {
  USE_PROFILES: { svg: true },
  ADD_TAGS: [
    'foreignObject',
    'div',
    'span',
    'p',
    'br',
    'i',
    'b',
    'em',
    'strong',
    'pre',
    'code',
  ],
  ADD_ATTR: ['class', 'style', 'xmlns', 'requiredExtensions'],
  HTML_INTEGRATION_POINTS: { foreignobject: true },
};

// jsdom and dompurify cost ~1s to import and only the macros that render SVG
// ever need them, so they are loaded on first use.
let purifiers: Promise<{ removeSize: DOMPurify; keepSize: DOMPurify }> | null =
  null;

async function loadPurifiers() {
  const [{ JSDOM }, { default: createDOMPurify }] = await Promise.all([
    import('jsdom'),
    import('dompurify'),
  ]);
  const window = new JSDOM('').window as unknown as Window;

  // Prevents use of global hooks
  const removeSize = createDOMPurify(window as unknown as WindowLike);
  removeSize.setConfig(SVG_PURIFY_CONFIG);
  removeSize.addHook('afterSanitizeAttributes', removeSvgWidthAndHeight);

  const keepSize = createDOMPurify(window as unknown as WindowLike);
  keepSize.setConfig(SVG_PURIFY_CONFIG);
  return { removeSize, keepSize };
}

/**
 * Sanitize an SVG string and return a base64-encoded string
 * @param svg - SVG content as a string
 * @param options - Options for sanitization
 * @param options.removeSize - Whether to remove width/height from the SVG element (default: true)
 * @returns base64-encoded sanitized SVG string
 */
export async function sanitizeSvgBase64(
  svg: string,
  options?: { removeSize?: boolean },
): Promise<string> {
  const { removeSize = true } = options ?? {};
  purifiers ??= loadPurifiers();
  const { removeSize: purifyRemoveSize, keepSize: purifyKeepSize } =
    await purifiers;
  const cleaned = (removeSize ? purifyRemoveSize : purifyKeepSize).sanitize(
    svg,
  );
  return Buffer.from(cleaned, 'utf-8').toString('base64');
}
