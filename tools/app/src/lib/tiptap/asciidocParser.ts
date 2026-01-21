/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2025
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import type { JSONContent } from '@tiptap/react';

/**
 * Regex patterns for AsciiDoc syntax
 */
const PATTERNS = {
  // Cyberismo macros - HIGHEST PRIORITY (must be matched before other patterns)
  macro: /^\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/,

  // Headings (= to ======) - AsciiDoc style
  heading: /^(={1,6})\s+(.+)$/,

  // Headings (# to ######) - Markdown style (for compatibility)
  markdownHeading: /^(#{1,6})\s+(.+)$/,

  // Lists
  unorderedListItem: /^(\*+)\s+(.+)$/,
  orderedListItem: /^(\.+)\s+(.+)$/,

  // Code block
  codeBlockStart: /^----$/,
  sourceBlock: /^\[source,(\w+)\]$/,

  // Block quote
  blockQuoteDelimiter: /^____$/,

  // Admonition
  admonition: /^(NOTE|TIP|IMPORTANT|WARNING|CAUTION):\s*(.*)$/,

  // Horizontal rule
  horizontalRule: /^'''$/,

  // Passthrough block (for HTML)
  passthroughStart: /^\+\+\+\+$/,

  // Empty line
  emptyLine: /^\s*$/,
};

/**
 * Parse inline AsciiDoc formatting within text
 */
function parseInlineContent(text: string): JSONContent[] {
  const result: JSONContent[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    // Bold: *text*
    const boldMatch = remaining.match(/^\*([^*]+)\*/);
    if (boldMatch) {
      result.push({
        type: 'text',
        marks: [{ type: 'bold' }],
        text: boldMatch[1],
      });
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    // Italic: _text_
    const italicMatch = remaining.match(/^_([^_]+)_/);
    if (italicMatch) {
      result.push({
        type: 'text',
        marks: [{ type: 'italic' }],
        text: italicMatch[1],
      });
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    // Monospace: `text`
    const monoMatch = remaining.match(/^`([^`]+)`/);
    if (monoMatch) {
      result.push({
        type: 'text',
        marks: [{ type: 'code' }],
        text: monoMatch[1],
      });
      remaining = remaining.slice(monoMatch[0].length);
      continue;
    }

    // Highlight: #text#
    const highlightMatch = remaining.match(/^#([^#]+)#/);
    if (highlightMatch) {
      result.push({
        type: 'text',
        marks: [{ type: 'highlight' }],
        text: highlightMatch[1],
      });
      remaining = remaining.slice(highlightMatch[0].length);
      continue;
    }

    // xref link: xref:file.adoc[text]
    // eslint-disable-next-line no-useless-escape
    const xrefMatch = remaining.match(/^xref:([^\[]+)\[([^\]]*)\]/);
    if (xrefMatch) {
      result.push({
        type: 'text',
        marks: [{ type: 'link', attrs: { href: `xref:${xrefMatch[1]}`, target: null } }],
        text: xrefMatch[2] || xrefMatch[1],
      });
      remaining = remaining.slice(xrefMatch[0].length);
      continue;
    }

    // URL link: https://url[text] or http://url[text]
    // eslint-disable-next-line no-useless-escape
    const urlLinkMatch = remaining.match(/^(https?:\/\/[^\[]+)\[([^\]]*)\]/);
    if (urlLinkMatch) {
      result.push({
        type: 'text',
        marks: [{ type: 'link', attrs: { href: urlLinkMatch[1], target: '_blank' } }],
        text: urlLinkMatch[2] || urlLinkMatch[1],
      });
      remaining = remaining.slice(urlLinkMatch[0].length);
      continue;
    }

    // Bare URL: https://url or http://url (without bracket notation)
    const bareUrlMatch = remaining.match(/^(https?:\/\/\S+)/);
    if (bareUrlMatch) {
      result.push({
        type: 'text',
        marks: [{ type: 'link', attrs: { href: bareUrlMatch[1], target: '_blank' } }],
        text: bareUrlMatch[1],
      });
      remaining = remaining.slice(bareUrlMatch[0].length);
      continue;
    }

    // Inline image: image:path[alt]
    // eslint-disable-next-line no-useless-escape
    const inlineImageMatch = remaining.match(/^image:([^\[]+)\[([^\]]*)\]/);
    if (inlineImageMatch) {
      // For inline images, we'll treat them as text for now
      // Full image support would need a custom inline node
      result.push({
        type: 'text',
        text: `[Image: ${inlineImageMatch[2] || inlineImageMatch[1]}]`,
      });
      remaining = remaining.slice(inlineImageMatch[0].length);
      continue;
    }

    // Plain text - consume one character at a time for characters that could start patterns
    // This ensures we don't accidentally consume 'xref:', 'http:', 'image:', etc.
    const firstChar = remaining[0];
    if (firstChar === 'x' || firstChar === 'h' || firstChar === 'i') {
      // These could start xref:, http://, https://, image:
      // Since we already checked for those patterns above and didn't match,
      // just consume this single character as plain text
      result.push({
        type: 'text',
        text: firstChar,
      });
      remaining = remaining.slice(1);
      continue;
    }

    // Plain text - consume until we hit a special character or potential pattern start
    // eslint-disable-next-line no-useless-escape
    const plainMatch = remaining.match(/^[^*_`#\[xhi]+/);
    if (plainMatch && plainMatch[0].length > 0) {
      result.push({
        type: 'text',
        text: plainMatch[0],
      });
      remaining = remaining.slice(plainMatch[0].length);
      continue;
    }

    // Single special character that didn't match a pattern
    result.push({
      type: 'text',
      text: remaining[0],
    });
    remaining = remaining.slice(1);
  }

  return result;
}

/**
 * Extract rendered content for macros from the parsed HTML
 * The backend wraps macro output with HTML comment markers:
 * <!-- MACRO_START:macroName --> ... content ... <!-- MACRO_END:macroName -->
 *
 * HTML comments are used because they:
 * - Survive AsciiDoctor processing unchanged
 * - Don't interfere with document structure
 * - Can wrap any content including headings, tables, etc.
 */
function extractMacroRenderedContent(
  renderedHtml: string | null | undefined,
): Map<string, string[]> {
  const macroContent = new Map<string, string[]>();

  if (!renderedHtml) return macroContent;

  // Find content between MACRO_START and MACRO_END comment markers
  // The regex captures the macro name and all content between the markers
  const markerRegex = /<!-- MACRO_START:(\w+) -->[\s\S]*?<!-- MACRO_END:\1 -->/g;

  let match;
  while ((match = markerRegex.exec(renderedHtml)) !== null) {
    const macroName = match[1];
    // Extract content between the markers (excluding the markers themselves)
    const fullMatch = match[0];
    const startMarker = `<!-- MACRO_START:${macroName} -->`;
    const endMarker = `<!-- MACRO_END:${macroName} -->`;
    const content = fullMatch
      .slice(startMarker.length, -endMarker.length)
      .trim();

    if (!macroContent.has(macroName)) {
      macroContent.set(macroName, []);
    }
    macroContent.get(macroName)!.push(content);
  }

  return macroContent;
}

/**
 * Parse AsciiDoc content into TipTap JSONContent
 * @param content - The raw AsciiDoc content
 * @param renderedHtml - Optional rendered HTML to extract macro outputs from
 */
export function parseAsciidoc(
  content: string,
  renderedHtml?: string | null,
): JSONContent {
  const lines = content.split('\n');
  const doc: JSONContent = {
    type: 'doc',
    content: [],
  };

  // Extract rendered macro content from HTML
  const macroRenderedContent = extractMacroRenderedContent(renderedHtml);
  // Track which macro instance we're on for each macro type
  const macroInstanceIndex = new Map<string, number>();

  let i = 0;
  let currentParagraphLines: string[] = [];

  const flushParagraph = () => {
    if (currentParagraphLines.length > 0) {
      const text = currentParagraphLines.join(' ').trim();
      if (text) {
        doc.content!.push({
          type: 'paragraph',
          content: parseInlineContent(text),
        });
      }
      currentParagraphLines = [];
    }
  };

  while (i < lines.length) {
    const line = lines[i];

    // Check for Cyberismo macro (can span multiple lines)
    // Look ahead to find the complete macro
    const macroStartMatch = line.match(/^\{\{#(\w+)\}\}/);
    if (macroStartMatch) {
      flushParagraph();

      const macroName = macroStartMatch[1];
      const macroEndPattern = new RegExp(`\\{\\{/${macroName}\\}\\}`);
      let macroContent = line;
      let j = i;

      // Find the end of the macro
      while (j < lines.length && !macroEndPattern.test(macroContent)) {
        j++;
        if (j < lines.length) {
          macroContent += '\n' + lines[j];
        }
      }

      // Get rendered content for this macro instance
      const instanceIdx = macroInstanceIndex.get(macroName) || 0;
      macroInstanceIndex.set(macroName, instanceIdx + 1);
      const renderedContents = macroRenderedContent.get(macroName) || [];
      const renderedHtmlForMacro = renderedContents[instanceIdx] || '';

      doc.content!.push({
        type: 'macroBlock',
        attrs: {
          source: macroContent,
          macroName: macroName,
          renderedHtml: renderedHtmlForMacro,
        },
      });

      i = j + 1;
      continue;
    }

    // Empty line - flush paragraph
    if (PATTERNS.emptyLine.test(line)) {
      flushParagraph();
      i++;
      continue;
    }

    // Heading (AsciiDoc style: = or Markdown style: #)
    const headingMatch = line.match(PATTERNS.heading) || line.match(PATTERNS.markdownHeading);
    if (headingMatch) {
      flushParagraph();
      const level = headingMatch[1].length;
      doc.content!.push({
        type: 'heading',
        attrs: { level: Math.min(level, 6) },
        content: parseInlineContent(headingMatch[2]),
      });
      i++;
      continue;
    }

    // Horizontal rule
    if (PATTERNS.horizontalRule.test(line)) {
      flushParagraph();
      doc.content!.push({ type: 'horizontalRule' });
      i++;
      continue;
    }

    // Unordered list item
    const ulMatch = line.match(PATTERNS.unorderedListItem);
    if (ulMatch) {
      flushParagraph();

      // Collect all consecutive list items
      const items: JSONContent[] = [];
      while (i < lines.length) {
        const itemMatch = lines[i].match(PATTERNS.unorderedListItem);
        if (!itemMatch) break;

        items.push({
          type: 'listItem',
          content: [{
            type: 'paragraph',
            content: parseInlineContent(itemMatch[2]),
          }],
        });
        i++;
      }

      doc.content!.push({
        type: 'bulletList',
        content: items,
      });
      continue;
    }

    // Ordered list item
    const olMatch = line.match(PATTERNS.orderedListItem);
    if (olMatch) {
      flushParagraph();

      // Collect all consecutive list items
      const items: JSONContent[] = [];
      while (i < lines.length) {
        const itemMatch = lines[i].match(PATTERNS.orderedListItem);
        if (!itemMatch) break;

        items.push({
          type: 'listItem',
          content: [{
            type: 'paragraph',
            content: parseInlineContent(itemMatch[2]),
          }],
        });
        i++;
      }

      doc.content!.push({
        type: 'orderedList',
        content: items,
      });
      continue;
    }

    // Code block
    const sourceMatch = line.match(PATTERNS.sourceBlock);
    if (sourceMatch || PATTERNS.codeBlockStart.test(line)) {
      flushParagraph();

      const language = sourceMatch ? sourceMatch[1] : 'text';
      let startLine = i;

      // If we matched [source,lang], skip to the ----
      if (sourceMatch) {
        startLine++;
        if (startLine < lines.length && PATTERNS.codeBlockStart.test(lines[startLine])) {
          startLine++;
        }
      } else {
        startLine++;
      }

      // Collect code block content
      const codeLines: string[] = [];
      while (startLine < lines.length && !PATTERNS.codeBlockStart.test(lines[startLine])) {
        codeLines.push(lines[startLine]);
        startLine++;
      }

      doc.content!.push({
        type: 'codeBlock',
        attrs: { language },
        content: [{ type: 'text', text: codeLines.join('\n') }],
      });

      i = startLine + 1;
      continue;
    }

    // Block quote
    if (PATTERNS.blockQuoteDelimiter.test(line)) {
      flushParagraph();

      const quoteLines: string[] = [];
      i++;
      while (i < lines.length && !PATTERNS.blockQuoteDelimiter.test(lines[i])) {
        quoteLines.push(lines[i]);
        i++;
      }

      doc.content!.push({
        type: 'blockquote',
        content: [{
          type: 'paragraph',
          content: parseInlineContent(quoteLines.join(' ')),
        }],
      });

      i++; // Skip closing delimiter
      continue;
    }

    // Admonition
    const admonitionMatch = line.match(PATTERNS.admonition);
    if (admonitionMatch) {
      flushParagraph();

      doc.content!.push({
        type: 'admonition',
        attrs: { type: admonitionMatch[1].toLowerCase() },
        content: [{
          type: 'paragraph',
          content: parseInlineContent(admonitionMatch[2]),
        }],
      });
      i++;
      continue;
    }

    // Passthrough block (skip for visual editing - preserve as macro-like block)
    if (PATTERNS.passthroughStart.test(line)) {
      flushParagraph();

      const passthroughLines: string[] = [line];
      i++;
      while (i < lines.length && !PATTERNS.passthroughStart.test(lines[i])) {
        passthroughLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) {
        passthroughLines.push(lines[i]);
        i++;
      }

      // Store passthrough as a macro-like block to preserve it
      doc.content!.push({
        type: 'macroBlock',
        attrs: {
          source: passthroughLines.join('\n'),
          macroName: 'passthrough',
        },
      });
      continue;
    }

    // Block image: image::path[alt]
    // eslint-disable-next-line no-useless-escape
    const blockImageMatch = line.match(/^image::([^\[]+)\[([^\]]*)\]/);
    if (blockImageMatch) {
      flushParagraph();

      doc.content!.push({
        type: 'image',
        attrs: {
          src: blockImageMatch[1],
          alt: blockImageMatch[2] || '',
        },
      });
      i++;
      continue;
    }

    // Regular text line - add to current paragraph
    currentParagraphLines.push(line);
    i++;
  }

  // Flush any remaining paragraph
  flushParagraph();

  // Ensure doc has at least one paragraph
  if (doc.content!.length === 0) {
    doc.content!.push({
      type: 'paragraph',
      content: [],
    });
  }

  return doc;
}
