/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import type { RenderedContent, RenderOptions } from '@cyberismo/model';
import type { Checkout } from '../../state/checkout/checkout.js';
import { rewriteAsciidocCardXrefs } from './asciidoc-xref.js';
import { read } from '../../infra/tx/rw-lock.js';
import { evaluateMacros } from './index.js';

/** The text that stands for content whose macros failed. */
export function macroErrorText(error: unknown, fallback: string): string {
  return `Macro error: ${error instanceof Error ? error.message : 'Unknown error'}\n\n${fallback}`;
}

/**
 * Card content rendering of one handle. Holds no state of its own.
 */
export class Render {
  /** @internal */
  constructor(private readonly checkout: Checkout) {}

  /**
   * Evaluates the macros of `content`. A failing macro gives its error text
   * followed by the fallback instead, and the error message.
   */
  @read
  public async macros(
    content: string,
    options: RenderOptions,
  ): Promise<RenderedContent> {
    const { fallback = content, ...context } = options;
    try {
      return {
        content: await evaluateMacros(content, {
          ...context,
          checkout: this.checkout,
        }),
      };
    } catch (error) {
      return {
        content: macroErrorText(error, fallback),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /** Rewrites the native xrefs to other cards in `content` into links. */
  @read
  public async xrefs(
    content: string,
    mode: RenderOptions['mode'],
  ): Promise<string> {
    return rewriteAsciidocCardXrefs(content, this.checkout, mode);
  }
}
