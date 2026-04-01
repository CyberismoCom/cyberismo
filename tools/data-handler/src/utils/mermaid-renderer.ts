/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2025

  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/
import { JSDOM } from 'jsdom';
import mermaid from 'mermaid';

let initialized = false;

function ensureInitialized() {
  if (initialized) return;

  // Set up a minimal DOM environment for mermaid
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
  const win = dom.window;

  // Provide DOM globals that mermaid needs
  global.window = win as unknown as Window & typeof globalThis;
  global.document = win.document;
  global.navigator = win.navigator;
  global.DOMParser = win.DOMParser;
  global.XMLSerializer = win.XMLSerializer;

  mermaid.initialize({
    startOnLoad: false,
    theme: 'default',
    securityLevel: 'strict',
  });

  initialized = true;
}

let renderCounter = 0;

/**
 * Render a Mermaid diagram definition to SVG string.
 * Uses jsdom to provide the DOM environment mermaid needs in Node.js.
 * @param code - Mermaid diagram definition text
 * @returns SVG string
 */
export async function renderMermaidToSvg(code: string): Promise<string> {
  ensureInitialized();
  const id = `mermaid-svg-${renderCounter++}`;
  const { svg } = await mermaid.render(id, code);
  return svg;
}

/**
 * Regex that matches standard AsciiDoc mermaid diagram blocks.
 * Supports [mermaid], [mermaid,id], [mermaid,id,format=svg], etc.
 * Matches both literal blocks (....) and listing blocks (----).
 */
const MERMAID_BLOCK_REGEX =
  /\[mermaid[^\]]*\]\n(\.{4,}|-{4,})\n([\s\S]*?)\n\1/g;

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

/**
 * Pre-processes AsciiDoc content to convert [mermaid] blocks into inline SVG images
 * for PDF export. Renders each diagram server-side.
 * @param content - Raw AsciiDoc content
 * @returns AsciiDoc content with mermaid blocks replaced by image directives
 */
export async function preprocessMermaidBlocksForPdf(
  content: string,
): Promise<string> {
  const matches = [...content.matchAll(MERMAID_BLOCK_REGEX)];
  if (matches.length === 0) return content;

  let result = content;
  for (const match of matches) {
    const fullMatch = match[0];
    const diagramCode = match[2];
    try {
      const svg = await renderMermaidToSvg(diagramCode);
      const base64 = Buffer.from(svg, 'utf-8').toString('base64');
      result = result.replace(
        fullMatch,
        `image::data:image/svg+xml;base64,${base64}[]`,
      );
    } catch {
      // If rendering fails, leave the block as-is
    }
  }
  return result;
}
