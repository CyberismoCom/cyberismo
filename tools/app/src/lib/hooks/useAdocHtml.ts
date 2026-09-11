/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2026

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { useEffect, useState } from 'react';

import { adocToHtml, cachedAdocHtml } from '../asciidoc';

/**
 * Converts a card's AsciiDoc to HTML, re-converting when the content changes.
 * Content converted before resolves during render, so revisiting a card does
 * not blank its body.
 * @param adoc macro-expanded AsciiDoc, as served by the card API
 * @param cardKey the card the content belongs to
 * @returns the rendered HTML, empty until the first conversion resolves
 */
export function useAdocHtml(adoc: string, cardKey: string): string {
  // The result is tagged so a pending conversion cannot paint over the next card.
  const [converted, setConverted] = useState<{
    token: string;
    html: string;
  } | null>(null);

  const token = `${cardKey}\n${adoc}`;
  const cached = cachedAdocHtml(adoc, cardKey);

  useEffect(() => {
    if (cached !== undefined) {
      return;
    }
    let current = true;
    adocToHtml(adoc, cardKey).then((html) => {
      if (current) {
        setConverted({ token, html });
      }
    });
    return () => {
      current = false;
    };
  }, [adoc, cardKey, token, cached]);

  if (cached !== undefined) {
    return cached;
  }
  return converted?.token === token ? converted.html : '';
}
