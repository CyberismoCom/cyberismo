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
  // Tagged with its card so one card's HTML never shows on another.
  const [converted, setConverted] = useState<{
    cardKey: string;
    html: string;
  } | null>(null);

  const cached = cachedAdocHtml(adoc, cardKey);

  // Remember cached results too, so they are the fallback for the next change.
  if (
    cached !== undefined &&
    (converted?.cardKey !== cardKey || converted.html !== cached)
  ) {
    setConverted({ cardKey, html: cached });
  }

  useEffect(() => {
    if (cached !== undefined) {
      return;
    }
    let current = true;
    adocToHtml(adoc, cardKey).then((html) => {
      if (current) {
        setConverted({ cardKey, html });
      }
    });
    return () => {
      current = false;
    };
  }, [adoc, cardKey, cached]);

  if (cached !== undefined) {
    return cached;
  }
  return converted?.cardKey === cardKey ? converted.html : '';
}
