// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { Checkout } from '../../state/checkout/checkout.js';
import type { Mode } from '../../shared/interfaces/macros.js';
import { moduleNameFromCardKey } from '../../shared/utils/card-utils.js';
import { cardNode } from '../cards/read.js';

// xref:<cardKey>.adoc[<label>] or xref:<cardKey>.adoc#<anchor>[<label>]
// Card key chars: word chars plus hyphen. Anchor (optional) is anything up to
// '[' that isn't a bracket. Label may be empty.
const NATIVE_CARD_XREF = /xref:([\w-]+)\.adoc(#[^[\]]+)?\[([^\]]*)\]/g;

/** The warning for links to a card that is not part of an export. */
export function notExportedWarning(cardKey: string): string {
  return `card "${cardKey}" is not part of this export; links to it are rendered as text`;
}

type RewriteMode = 'inject' | 'staticSite' | 'static';

function isRewriteMode(mode: Mode): mode is RewriteMode {
  return mode === 'inject' || mode === 'staticSite' || mode === 'static';
}

/**
 * Rewrites native AsciiDoc cross-references that point at Cyberismo cards
 * (`xref:<cardKey>.adoc[...]`) into a form Asciidoctor can render correctly:
 *
 * - `inject` / `staticSite` → `link:/projects/<projectPrefix>/cards/<cardKey>[...]`
 *   matching the React app's multi-project route. The project prefix is
 *   derived from the target card's key.
 * - `static` (PDF) → `<<cardKey,label>>` (or `<<cardKey>>` when the label is
 *   empty), targeting the `[[cardKey]]` anchor declared by the include macro
 *   for each card in the PDF source.
 * - any other mode → content returned unchanged.
 *
 * In `static` and `staticSite` mode, a card that is not in `exported` has no
 * page or anchor in the export, so its xref becomes plain text: the label, or
 * else the card's title. An undefined `exported` means the whole project.
 *
 * Unresolvable targets, and targets left out of the export, are reported
 * through `onWarning`, once per target.
 */
export function rewriteAsciidocCardXrefs(
  content: string,
  checkout: Checkout,
  mode: Mode,
  onWarning: (message: string) => void = console.warn,
  exported?: ReadonlySet<string>,
): string {
  if (!isRewriteMode(mode)) {
    return content;
  }

  const warned = new Set<string>();
  const anchorDropWarned = new Set<string>();
  const notExportedWarned = new Set<string>();

  return content.replace(
    NATIVE_CARD_XREF,
    (match, cardKey: string, anchor: string | undefined, label: string) => {
      let card;

      try {
        card = cardNode(checkout, cardKey);
      } catch {
        card = undefined;
      }

      if (!card) {
        if (!warned.has(cardKey)) {
          warned.add(cardKey);
          onWarning(
            `xref target "${cardKey}.adoc" does not match a known card; leaving link unchanged`,
          );
        }
        return match;
      }

      if (mode !== 'inject' && exported && !exported.has(cardKey)) {
        if (!notExportedWarned.has(cardKey)) {
          notExportedWarned.add(cardKey);
          onWarning(notExportedWarning(cardKey));
        }
        return label !== '' ? label : (card.metadata?.title ?? cardKey);
      }

      if (mode === 'static') {
        if (anchor && !anchorDropWarned.has(cardKey)) {
          anchorDropWarned.add(cardKey);
          onWarning(
            `xref to "${cardKey}.adoc${anchor}" includes an in-card anchor that cannot be resolved in PDF output; dropping anchor`,
          );
        }
        return label !== '' ? `<<${cardKey},${label}>>` : `<<${cardKey}>>`;
      }

      let projectPrefix: string;
      try {
        projectPrefix = moduleNameFromCardKey(cardKey);
      } catch {
        if (!warned.has(cardKey)) {
          warned.add(cardKey);
          onWarning(
            `xref target "${cardKey}.adoc" has no module prefix; leaving link unchanged`,
          );
        }
        return match;
      }

      const linkText = label !== '' ? label : (card.metadata?.title ?? cardKey);
      const target = `/projects/${projectPrefix}/cards/${cardKey}${anchor ?? ''}`;
      return `link:${target}[${linkText}]`;
    },
  );
}
