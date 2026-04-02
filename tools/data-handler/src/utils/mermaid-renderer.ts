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
import type mermaidType from 'mermaid';
import { Resvg } from '@resvg/resvg-js';
import { measureTextWidth } from '../svg/lib.js';

let mermaid: typeof mermaidType | null = null;

/**
 * Set up DOM globals and dynamically import mermaid.
 * Mermaid (and its bundled DOMPurify) must be imported AFTER the jsdom
 * globals are in place, otherwise DOMPurify initializes without a window
 * and its methods are missing.
 */
async function ensureInitialized(): Promise<typeof mermaidType> {
  if (mermaid) return mermaid;

  // Set up a minimal DOM environment for mermaid.
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
  const win = dom.window;

  // In Node 22+, some globals (e.g. navigator) have read-only getters,
  // so we must use Object.defineProperty to override them.
  const globals: Record<string, unknown> = {
    window: win,
    document: win.document,
    navigator: win.navigator,
    DOMParser: win.DOMParser,
    XMLSerializer: win.XMLSerializer,
  };
  for (const [key, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, key, {
      value,
      writable: true,
      configurable: true,
    });
  }

  // jsdom doesn't implement SVG geometry methods that mermaid needs for
  // layout calculations. Provide stubs that estimate dimensions from text
  // content using string-pixel-width.
  //
  // IMPORTANT: These estimates must be GENEROUS (overestimate rather than
  // underestimate). Mermaid uses them to size nodes and position elements.
  // The final PNG is rendered by resvg with real system fonts, which are
  // typically wider than string-pixel-width estimates. If we underestimate,
  // text overflows node boundaries in the rendered PNG.
  const FONT_NAME = 'arial';
  const FONT_SIZE = 16;
  const LINE_HEIGHT = 24;
  const WIDTH_SCALE = 1.4; // Overestimate width: real fonts are wider
  const PADDING = 40; // Generous padding for node margins

  // Parse "translate(x, y)" from a transform attribute
  const parseTranslate = (transform: string | null) => {
    if (!transform) return { x: 0, y: 0 };
    const m = transform.match(/translate\(\s*([\d.-]+)[,\s]+([\d.-]+)\s*\)/);
    return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]) } : { x: 0, y: 0 };
  };

  const SVGProto = win.SVGElement.prototype as unknown as Record<string, unknown>;
  if (!SVGProto.getBBox) {
    SVGProto.getBBox = function (this: SVGElement) {
      const tag = this.tagName?.toLowerCase();
      const text = this.textContent?.trim() || '';

      // For leaf text elements, estimate from content
      if (tag === 'text' || tag === 'tspan' || tag === 'foreignobject') {
        const lines = text.split('\n').filter((l) => l.trim());
        const maxLine = lines.reduce((a, b) => (a.length > b.length ? a : b), '');
        const width = measureTextWidth(maxLine, FONT_NAME, FONT_SIZE) * WIDTH_SCALE + PADDING;
        const height = Math.max(LINE_HEIGHT, lines.length * LINE_HEIGHT) + PADDING / 2;
        return { x: 0, y: 0, width, height };
      }

      // For <g> elements, compute bounding box from children
      if (tag === 'g' || tag === 'svg') {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        let hasChild = false;
        for (const child of Array.from(this.children)) {
          if (!(child instanceof win.SVGElement)) continue;
          try {
            const childBBox = (child as unknown as { getBBox: () => { x: number; y: number; width: number; height: number } }).getBBox();
            const offset = parseTranslate(child.getAttribute('transform'));
            const cx = childBBox.x + offset.x;
            const cy = childBBox.y + offset.y;
            if (childBBox.width > 0 || childBBox.height > 0) {
              hasChild = true;
              minX = Math.min(minX, cx);
              minY = Math.min(minY, cy);
              maxX = Math.max(maxX, cx + childBBox.width);
              maxY = Math.max(maxY, cy + childBBox.height);
            }
          } catch {
            // Skip elements that can't be measured
          }
        }
        if (hasChild) {
          return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
        }
        // Empty group: small default
        return { x: 0, y: 0, width: 0, height: 0 };
      }

      // For other elements (rect, path, etc.): reasonable default
      return { x: 0, y: 0, width: 50, height: 20 };
    };
  }
  if (!SVGProto.getComputedTextLength) {
    SVGProto.getComputedTextLength = function (this: SVGElement) {
      // Return a small value to prevent mermaid's character-by-character
      // text wrapping algorithm from splitting labels. Mermaid wraps when
      // getComputedTextLength exceeds ~200px. By returning near-zero,
      // no label ever triggers wrapping.
      // Node/edge spacing is controlled by getBoundingClientRect (on HTML
      // elements) which uses the accurate WIDTH_SCALE measurement.
      return 1;
    };
  }
  if (!SVGProto.getTotalLength) {
    SVGProto.getTotalLength = () => 100;
  }
  if (!SVGProto.getPointAtLength) {
    SVGProto.getPointAtLength = () => ({ x: 0, y: 0 });
  }

  // CRITICAL: Mermaid uses getBoundingClientRect() on the HTML <div>/<span>
  // inside <foreignObject> to measure node label dimensions. jsdom's native
  // getBoundingClientRect returns {width:0, height:0}, which causes mermaid
  // to fall back to its default 60×30 node size — far too small for most text.
  // Override it to estimate dimensions from text content.
  const origGetBCR = win.HTMLElement.prototype.getBoundingClientRect;
  win.HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
    const text = this.textContent?.trim() || '';
    if (text) {
      const lines = text.split(/\n/).filter((l: string) => l.trim());
      const maxLine = lines.reduce((a: string, b: string) => (a.length > b.length ? a : b), '');
      const width = measureTextWidth(maxLine, FONT_NAME, FONT_SIZE) * WIDTH_SCALE + PADDING;
      const height = Math.max(LINE_HEIGHT, lines.length * LINE_HEIGHT) + PADDING / 2;
      return { x: 0, y: 0, width, height, top: 0, left: 0, right: width, bottom: height } as DOMRect;
    }
    return origGetBCR.call(this);
  };

  // Mermaid internally does `import DOMPurify from 'dompurify'` and calls
  // DOMPurify.sanitize/addHook. In Node.js, dompurify's default export is
  // the result of createDOMPurify() — if `window` didn't exist at load time,
  // method calls like .sanitize() fail. Since dompurify is already cached by
  // other modules (e.g. sanitize-svg.ts), we can't re-import it.
  // Fix: import the cached module and re-initialize it with the jsdom window
  // by calling it as a factory, then copy instance methods onto the default export
  // so mermaid's reference works.
  const dompurifyModule = await import('dompurify');
  const dompurifyDefault = dompurifyModule.default;
  // dompurify's default export is callable: DOMPurify(window) creates a new instance
  const purifyInstance = (dompurifyDefault as unknown as (root: unknown) => typeof dompurifyDefault)(win);
  // Copy all instance methods onto the default export so mermaid's import works
  for (const key of Object.keys(purifyInstance) as (keyof typeof purifyInstance)[]) {
    try {
      (dompurifyDefault as unknown as Record<string, unknown>)[key as string] = purifyInstance[key];
    } catch {
      // Some properties may not be writable
    }
  }

  // Dynamic import so mermaid's bundled DOMPurify sees `window` at init time
  const mod = await import('mermaid');
  mermaid = mod.default;

  mermaid.initialize({
    startOnLoad: false,
    theme: 'default',
    securityLevel: 'strict',
    // Disable automatic text wrapping — in server-side rendering without
    // real font metrics, mermaid wraps text mid-word at bad positions.
    markdownAutoWrap: false,
    // Use native SVG <text> instead of <foreignObject> HTML for labels.
    // This is critical for PDF export: resvg cannot render HTML-in-SVG.
    // Only the server-side renderer uses this; web view renders client-side.
    flowchart: { htmlLabels: false, wrappingWidth: 9999 },
  });

  return mermaid;
}

let renderCounter = 0;

/**
 * Render a Mermaid diagram definition to SVG string.
 * Uses jsdom to provide the DOM environment mermaid needs in Node.js.
 * @param code - Mermaid diagram definition text
 * @returns SVG string
 */
export async function renderMermaidToSvg(code: string): Promise<string> {
  const m = await ensureInitialized();
  const id = `mermaid-svg-${renderCounter++}`;
  const { svg } = await m.render(id, code);
  return svg;
}

/**
 * Convert an SVG string to a PNG buffer using resvg.
 * resvg is a Rust-based SVG renderer that handles CSS, text, and all
 * standard SVG features — unlike Prawn's limited SVG parser.
 *
 * Mermaid uses <foreignObject> HTML for node labels, which resvg cannot
 * parse (it requires strict XML SVG). We convert these to SVG <text>
 * elements before rasterizing. resvg handles the CSS <style> block,
 * fonts, and shapes correctly — only the text conversion is needed.
 */
function svgToPng(svgInput: string): Buffer {
  const svg = replaceForeignObjects(svgInput);
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: 1200 },
    font: { loadSystemFonts: true },
  });
  const pngData = resvg.render();
  return Buffer.from(pngData.asPng());
}

/**
 * Replace <foreignObject> elements with SVG <text> elements.
 * Mermaid wraps node labels in <foreignObject><div>...</div></foreignObject>.
 * resvg requires strict XML and cannot render HTML inside SVG.
 *
 * Extracts the text content, splits into lines, and creates <tspan>
 * elements centered within the foreignObject's bounding box.
 */
function replaceForeignObjects(svgInput: string): string {
  const dom = new JSDOM(
    `<!DOCTYPE html><html><body>${svgInput}</body></html>`,
  );
  const doc = dom.window.document;
  const svgEl = doc.querySelector('svg');
  if (!svgEl) return svgInput;

  for (const fo of Array.from(svgEl.querySelectorAll('foreignObject'))) {
    // Extract visible text, preserving line breaks from <br> and block elements
    const html = fo.innerHTML;
    // Replace <br>, </p>, </div> with newline markers before extracting text
    const withBreaks = html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/div>/gi, '\n');
    // Create a temp element to extract text with newlines
    const temp = doc.createElement('div');
    temp.innerHTML = withBreaks;
    const rawText = temp.textContent || '';
    const lines = rawText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l);

    if (lines.length === 0) {
      fo.remove();
      continue;
    }

    const foX = parseFloat(fo.getAttribute('x') || '0');
    const foY = parseFloat(fo.getAttribute('y') || '0');
    const foWidth = parseFloat(fo.getAttribute('width') || '200');
    const foHeight = parseFloat(fo.getAttribute('height') || '40');

    const fontSize = 14;
    const lineHeight = fontSize * 1.3;
    const centerX = foX + foWidth / 2;
    // Vertically center the text block within the foreignObject
    const totalTextHeight = lines.length * lineHeight;
    const startY = foY + (foHeight - totalTextHeight) / 2 + fontSize * 0.85;

    const textEl = doc.createElementNS('http://www.w3.org/2000/svg', 'text');
    textEl.setAttribute('text-anchor', 'middle');
    textEl.setAttribute('font-family', 'sans-serif');
    textEl.setAttribute('font-size', String(fontSize));
    textEl.setAttribute('fill', '#333');

    for (let i = 0; i < lines.length; i++) {
      const tspan = doc.createElementNS('http://www.w3.org/2000/svg', 'tspan');
      tspan.setAttribute('x', centerX.toFixed(1));
      tspan.setAttribute('y', (startY + i * lineHeight).toFixed(1));
      tspan.textContent = lines[i];
      textEl.appendChild(tspan);
    }

    fo.replaceWith(textEl);
  }

  return svgEl.outerHTML;
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
 * Pre-processes AsciiDoc content to convert [mermaid] blocks into inline
 * base64-encoded PNG images for PDF export. Mermaid SVGs contain
 * <foreignObject> HTML and CSS that asciidoctor-pdf's Prawn SVG parser
 * cannot handle. Converting to PNG via resvg bypasses all these limitations.
 * @param content - Raw AsciiDoc content
 * @returns Processed content with mermaid blocks replaced by inline PNG image references
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
      const pngBuffer = svgToPng(svg);
      const base64 = pngBuffer.toString('base64');
      result = result.replace(
        fullMatch,
        `image::data:image/png;base64,${base64}[]`,
      );
    } catch {
      // If rendering fails, leave the block as-is
    }
  }

  return result;
}
