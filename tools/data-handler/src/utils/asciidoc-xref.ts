/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import type { Project } from '../containers/project.js';
import type { Mode } from '../interfaces/macros.js';
import { moduleNameFromCardKey } from './card-utils.js';

// xref:<cardKey>.adoc[<label>] or xref:<cardKey>.adoc#<anchor>[<label>]
// Card key chars: word chars plus hyphen. Anchor (optional) is anything up to
// '[' that isn't a bracket. Label may be empty.
const NATIVE_CARD_XREF = /xref:([\w-]+)\.adoc(#[^[\]]+)?\[([^\]]*)\]/g;

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
 */
export function rewriteAsciidocCardXrefs(
  content: string,
  project: Project,
  mode: Mode,
): string {
  if (!isRewriteMode(mode)) {
    return content;
  }

  const warned = new Set<string>();
  const anchorDropWarned = new Set<string>();

  return content.replace(
    NATIVE_CARD_XREF,
    (match, cardKey: string, anchor: string | undefined, label: string) => {
      const card = project.findCard(cardKey);
      if (!card) {
        if (!warned.has(cardKey)) {
          warned.add(cardKey);
          console.warn(
            `xref target "${cardKey}.adoc" does not match a known card; leaving link unchanged`,
          );
        }
        return match;
      }

      if (mode === 'static') {
        if (anchor && !anchorDropWarned.has(cardKey)) {
          anchorDropWarned.add(cardKey);
          console.warn(
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
          console.warn(
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
