// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Regex that matches standard AsciiDoc mermaid diagram blocks.
 * Supports [mermaid], [mermaid,id], [mermaid,id,format=svg], etc.
 * Matches both literal blocks (....) and listing blocks (----).
 * Supports both LF and CRLF line endings.
 */
const MERMAID_BLOCK_REGEX =
  /\[mermaid[^\]]*\]\r?\n(\.{4,}|-{4,})\r?\n([\s\S]*?)\r?\n\1/g;

/**
 * Pre-processes AsciiDoc content to convert [mermaid] blocks into passthrough HTML
 * that can be detected and rendered by the frontend.
 * This must run BEFORE asciidoctor.js converts the AsciiDoc to HTML.
 * @param content - Raw AsciiDoc content
 * @returns AsciiDoc content with mermaid blocks replaced by passthrough HTML divs
 */
export function preprocessMermaidBlocksForHtml(content: string): string {
  return content.replace(MERMAID_BLOCK_REGEX, (_match, _delim, code) => {
    const encoded = Buffer.from(code, 'utf-8').toString('base64');
    return `++++\n<div class="mermaid-block" data-mermaid-code="${encoded}"></div>\n++++`;
  });
}
