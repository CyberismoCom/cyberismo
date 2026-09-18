/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2026

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { convert } from '@asciidoctor/core';

import { projectApiPaths } from './swr';

// Asciidoctor resolves include:: over XMLHttpRequest in the browser, so card content
// could otherwise fetch same-origin endpoints with the viewer's session. SECURE drops
// includes; icons survives it because asciidoctor's gate is `attr_overrides ||= nil`.
const SAFE_MODE = 'secure';

const CACHE_LIMIT = 20;
const cache = new Map<string, string>();

function cacheKey(adoc: string, imagesdir: string): string {
  return `${imagesdir}\n${adoc}`;
}

function imagesDirFor(cardKey: string, projectPrefix?: string): string {
  return projectApiPaths(projectPrefix).cardImages(cardKey);
}

/**
 * Returns already-converted HTML for this content, without converting.
 * @param adoc macro-expanded AsciiDoc, as served by the card API
 * @param cardKey the card the content belongs to
 * @param projectPrefix project the card belongs to, defaulting to the current one
 * @returns the HTML, or undefined if this content has not been converted yet
 */
export function cachedAdocHtml(
  adoc: string,
  cardKey: string,
  projectPrefix?: string,
): string | undefined {
  if (!adoc) {
    return '';
  }
  return cache.get(cacheKey(adoc, imagesDirFor(cardKey, projectPrefix)));
}

/**
 * Converts a card's AsciiDoc to HTML.
 * @param adoc macro-expanded AsciiDoc, as served by the card API
 * @param cardKey the card the content belongs to; resolves relative image paths
 * @param projectPrefix project the card belongs to, defaulting to the current one
 * @returns the rendered HTML, ready for renderCardHtml
 */
export async function adocToHtml(
  adoc: string,
  cardKey: string,
  projectPrefix?: string,
): Promise<string> {
  if (!adoc) {
    return '';
  }

  const imagesdir = imagesDirFor(cardKey, projectPrefix);
  const key = cacheKey(adoc, imagesdir);

  const cached = cache.get(key);
  if (cached !== undefined) {
    return cached;
  }

  const html = (
    await convert(adoc, {
      safe: SAFE_MODE,
      attributes: {
        imagesdir,
        icons: 'font',
      },
    })
  ).toString();

  if (cache.size >= CACHE_LIMIT) {
    cache.delete(cache.keys().next().value as string);
  }
  cache.set(key, html);

  return html;
}
