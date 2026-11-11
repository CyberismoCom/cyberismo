// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useState } from 'react';

import { adocToHtml, cachedAdocHtml } from '../asciidoc';

/**
 * Converts a card's AsciiDoc to HTML, re-converting when the content changes.
 * Content converted before resolves during render, so revisiting a card does
 * not blank its body. While a changed card re-converts, its previous HTML is
 * kept so the body does not unmount and lose scroll position or selection.
 * @param adoc macro-expanded AsciiDoc, as served by the card API
 * @param cardKey the card the content belongs to
 * @returns the rendered HTML, empty until the first conversion for the card resolves
 */
export function useAdocHtml(adoc: string, cardKey: string): string {
  // Tagged so a pending conversion cannot paint over the next card.
  const [converted, setConverted] = useState<{
    cardKey: string;
    token: string;
    html: string;
  } | null>(null);

  const token = `${cardKey}\n${adoc}`;
  const cached = cachedAdocHtml(adoc, cardKey);

  // Remember cached results too, so they are the fallback for the next change.
  if (cached !== undefined && converted?.token !== token) {
    setConverted({ cardKey, token, html: cached });
  }

  useEffect(() => {
    if (cached !== undefined) {
      return;
    }
    let current = true;
    adocToHtml(adoc, cardKey).then((html) => {
      if (current) {
        setConverted({ cardKey, token, html });
      }
    });
    return () => {
      current = false;
    };
  }, [adoc, cardKey, token, cached]);

  if (cached !== undefined) {
    return cached;
  }
  return converted?.cardKey === cardKey ? converted.html : '';
}
