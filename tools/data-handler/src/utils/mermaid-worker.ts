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

/**
 * Worker thread that renders Mermaid diagrams to PNG without a browser.
 *
 * Mermaid is a browser-oriented library: it reads `globalThis.window` /
 * `globalThis.document` and expects a handful of browser globals. We provide a
 * minimal DOM via `svgdom` (which, unlike jsdom, implements the SVG text metrics
 * Mermaid needs for layout) and rasterize the resulting SVG to PNG with resvg.
 *
 * This runs in a dedicated worker so the DOM globals it installs cannot leak
 * into the main thread, where they would change how other libraries (e.g. vega)
 * detect their environment.
 */
import { parentPort } from 'node:worker_threads';
import { createHTMLWindow } from 'svgdom';
import { Resvg } from '@resvg/resvg-js';

import type {
  MermaidWorkerRequest,
  MermaidWorkerResponse,
  MermaidRenderResult,
} from './mermaid-renderer.js';

// Minimal CSSStyleSheet implementation. svgdom does not provide one, but Mermaid
// builds a stylesheet then serializes it back to a string via `rule.cssText`.
class MinimalCSSStyleSheet {
  cssRules: { cssText: string }[] = [];
  insertRule(rule: string, index: number = this.cssRules.length): number {
    this.cssRules.splice(index, 0, { cssText: rule });
    return index;
  }
  deleteRule(index: number): void {
    this.cssRules.splice(index, 1);
  }
  replaceSync(text: string): void {
    this.cssRules = [{ cssText: text }];
  }
  replace(text: string): Promise<MinimalCSSStyleSheet> {
    this.replaceSync(text);
    return Promise.resolve(this);
  }
}

// Install the DOM globals before Mermaid is imported. These statements run once,
// synchronously, at worker module load.
const svgWindow = createHTMLWindow() as unknown as Record<string, unknown> & {
  document: unknown;
};
const globals = globalThis as unknown as Record<string, unknown>;
globals.window = svgWindow;
globals.document = svgWindow.document;
globals.CSSStyleSheet = MinimalCSSStyleSheet;
svgWindow.CSSStyleSheet = MinimalCSSStyleSheet;
const fakeMatchMedia = () => ({
  matches: false,
  addEventListener() {},
  removeEventListener() {},
});
svgWindow.matchMedia ??= fakeMatchMedia;
globals.matchMedia = svgWindow.matchMedia;

// Largest PNG dimension we will rasterize to, to bound memory for big diagrams.
const MAX_DIMENSION = 4000;

type MermaidApi = {
  initialize: (config: Record<string, unknown>) => void;
  render: (id: string, text: string) => Promise<{ svg: string }>;
};

let mermaidPromise: Promise<MermaidApi> | undefined;
let renderCounter = 0;

// Lazily import and configure Mermaid. The dynamic import must happen after the
// globals above are installed, because Mermaid reads them at module load.
function getMermaid(): Promise<MermaidApi> {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((module) => {
      const mermaid = module.default as unknown as MermaidApi;
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'loose',
        theme: 'default',
        // Render labels as native <text> rather than <foreignObject>, which resvg
        // cannot rasterize.
        htmlLabels: false,
        flowchart: { htmlLabels: false },
      });
      return mermaid;
    });
  }
  return mermaidPromise;
}

function svgSize(svg: string): { width: number; height: number } {
  const match = svg.match(
    /viewBox="[\d.eE+-]+\s+[\d.eE+-]+\s+([\d.eE+]+)\s+([\d.eE+]+)"/,
  );
  const width = match ? Number.parseFloat(match[1]) : 800;
  const height = match ? Number.parseFloat(match[2]) : 600;
  return { width, height };
}

async function renderToPng(code: string, scale: number): Promise<string> {
  const mermaid = await getMermaid();
  const { svg } = await mermaid.render(`mermaid-${renderCounter++}`, code);

  const { width, height } = svgSize(svg);
  const longest = Math.max(width, height) * scale;
  const fitTo: { mode: 'width' | 'zoom'; value: number } =
    longest > MAX_DIMENSION
      ? {
          mode: 'width',
          value: Math.round((MAX_DIMENSION * width) / Math.max(width, height)),
        }
      : { mode: 'zoom', value: scale };

  const resvg = new Resvg(svg, { background: 'white', fitTo });
  return resvg.render().asPng().toString('base64');
}

if (parentPort) {
  parentPort.on('message', (message: MermaidWorkerRequest) => {
    if (!parentPort) return;
    void (async () => {
      const results: MermaidRenderResult[] = [];
      for (const code of message.codes) {
        try {
          results.push({
            ok: true,
            png: await renderToPng(code, message.scale),
          });
        } catch (error) {
          results.push({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      const response: MermaidWorkerResponse = { results };
      parentPort.postMessage(response);
    })();
  });
}
