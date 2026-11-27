// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { Extensions, type Registry } from '@asciidoctor/core';

import { PART_ID_PATTERN, PART_REFERENCE } from '../interfaces/parts.js';

/** What a valid part reference turns into, as HTML, given its id. */
export interface PartRenderers {
  /** A block reference, `cyberismo-part::<id>[]` on its own line. */
  block: (id: string) => string;
  /** An inline reference, `cyberismo-part:<id>[]`. */
  inline: (id: string) => string;
}

/** True if a reference with this target and bracket text names a part. */
function isReference(target: string, text: string): boolean {
  return PART_ID_PATTERN.test(target) && text === '';
}

/**
 * The text an inline macro that is not a reference stands for, as it was
 * written. Target and text are already substituted, and a `]` in the text can
 * only have come from `\]`.
 */
function inlineLiteral(target: string, text: string): string {
  return `${PART_REFERENCE}:${target}[${text.split(']').join('\\]')}]`;
}

/**
 * Asciidoctor extensions that turn each part reference into what `render`
 * makes of its id. Anything that is not a reference shows as without the
 * extensions: a block line as the paragraph Asciidoctor would make of it, an
 * inline macro as its text. The registry is made from a function, so it is
 * activated for every conversion and nothing is registered globally.
 */
export function partReferences(render: PartRenderers): Registry {
  return Extensions.create(PART_REFERENCE, function (this: Registry) {
    this.blockMacro(PART_REFERENCE, function () {
      // A macro processor parses the bracket text as attributes by default;
      // the text model hands it over as written, so a reference is told
      // apart by its empty brackets and anything else can be shown as is.
      this.contentModel('text');
      this.process(function (parent, target, attributes) {
        const text = String(attributes.text ?? '');
        return isReference(target, text)
          ? this.createPassBlock(parent, render.block(target), {})
          : this.createParagraph(
              parent,
              `${PART_REFERENCE}::${target}[${text}]`,
              {},
            );
      });
    });
    this.inlineMacro(PART_REFERENCE, function () {
      // As for the block macro: the bracket text as written, not attributes.
      this.contentModel('text');
      this.process(function (parent, target, attributes) {
        const text = String(attributes.text ?? '');
        return this.createInline(
          parent,
          'quoted',
          isReference(target, text)
            ? render.inline(target)
            : inlineLiteral(target, text),
          { type: 'unquoted' },
        );
      });
    });
  });
}
