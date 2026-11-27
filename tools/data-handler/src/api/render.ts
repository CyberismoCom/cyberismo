// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type {
  RenderedContent,
  RenderedPart,
  RenderOptions,
} from '@cyberismo/model';
import type { Checkout } from '../state/checkout/checkout.js';
import { rewriteAsciidocCardXrefs } from '../domain/macros/index.js';
import { read } from '../infra/tx/rw-lock.js';
import { evaluateMacros } from '../domain/macros/index.js';
import { LogicUnavailableError } from '../infra/logic/logic-backend.js';

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
   * Evaluates the macros of `content`. Each interactive macro becomes a part
   * reference in the content and a part in `parts`, which holds only the
   * parts the content refers to. A failing macro gives its error text
   * followed by the fallback instead, the error message and no parts. A
   * logic backend that cannot answer now fails the call instead.
   */
  @read
  public async macros(
    content: string,
    options: RenderOptions,
  ): Promise<RenderedContent> {
    const { fallback = content, ...context } = options;
    const parts = new Map<string, RenderedPart>();
    try {
      const rendered = await evaluateMacros(content, {
        ...context,
        checkout: this.checkout,
        parts,
      });
      return {
        content: rendered,
        parts: Object.fromEntries(
          [...parts].filter(([id]) => rendered.includes(id)),
        ),
      };
    } catch (error) {
      if (error instanceof LogicUnavailableError) throw error;
      return {
        content: macroErrorText(error, fallback),
        parts: {},
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Rewrites the native xrefs to other cards in `content` into links. In a
   * static export, an xref to a card that is not in `options.exported` becomes
   * plain text; an undefined set means the whole project.
   * @param options.onWarning Receives the warnings; console.warn by default.
   */
  @read
  public async xrefs(
    content: string,
    mode: RenderOptions['mode'],
    options: {
      exported?: ReadonlySet<string>;
      onWarning?: (message: string) => void;
    } = {},
  ): Promise<string> {
    return rewriteAsciidocCardXrefs(
      content,
      this.checkout,
      mode,
      options.onWarning,
      options.exported,
    );
  }
}
