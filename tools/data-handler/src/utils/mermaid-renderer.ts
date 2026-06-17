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
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';

/**
 * Regex that matches standard AsciiDoc mermaid diagram blocks.
 * Supports [mermaid], [mermaid,id], [mermaid,id,format=svg], etc.
 * Matches both literal blocks (....) and listing blocks (----).
 * Supports both LF and CRLF line endings.
 */
const MERMAID_BLOCK_REGEX =
  /\[mermaid[^\]]*\]\r?\n(\.{4,}|-{4,})\r?\n([\s\S]*?)\r?\n\1/g;

/** Rasterization scale (multiplier over the diagram's intrinsic size). */
const PNG_SCALE = 3;

export interface MermaidWorkerRequest {
  codes: string[];
  scale: number;
}

export type MermaidRenderResult =
  | { ok: true; png: string }
  | { ok: false; error: string };

export interface MermaidWorkerResponse {
  results: MermaidRenderResult[];
}

/**
 * Resolve the path to the compiled worker. Mirrors the convention used by the
 * migration worker: the worker always runs from the built `dist` output, even
 * when the calling code runs from `src` under a test runner.
 */
function workerPath(): string {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const distDir = currentDir.replace(
    join('src', 'utils'),
    join('dist', 'utils'),
  );
  return join(distDir, 'mermaid-worker.js');
}

/**
 * Render a batch of Mermaid diagram definitions to PNG buffers in a worker
 * thread. Rendering happens off the main thread so the DOM globals Mermaid needs
 * cannot leak into the rest of the process. Diagrams that fail to render resolve
 * to `null` so the caller can fall back gracefully.
 *
 * @param codes - Mermaid diagram definitions
 * @returns Array aligned with `codes`; each entry is a PNG Buffer or null
 */
export function renderMermaidDiagrams(
  codes: string[],
): Promise<Array<Buffer | null>> {
  if (codes.length === 0) return Promise.resolve([]);

  return new Promise((resolve, reject) => {
    const worker = new Worker(workerPath(), { execArgv: process.execArgv });
    let settled = false;

    const finish = (value: Array<Buffer | null>) => {
      if (settled) return;
      settled = true;
      void worker.terminate();
      resolve(value);
    };

    worker.on('message', (response: MermaidWorkerResponse) => {
      finish(
        response.results.map((result) =>
          result.ok ? Buffer.from(result.png, 'base64') : null,
        ),
      );
    });

    worker.on('error', (error) => {
      if (settled) return;
      settled = true;
      void worker.terminate();
      reject(error);
    });

    worker.on('exit', (code) => {
      if (settled) return;
      settled = true;
      reject(new Error(`Mermaid worker exited with code ${code}`));
    });

    const request: MermaidWorkerRequest = { codes, scale: PNG_SCALE };
    worker.postMessage(request);
  });
}

/**
 * Render a single Mermaid diagram definition to a PNG buffer.
 *
 * @param code - Mermaid diagram definition text
 * @returns PNG Buffer, or null if rendering failed
 */
export async function renderMermaidToPng(code: string): Promise<Buffer | null> {
  const [result] = await renderMermaidDiagrams([code]);
  return result ?? null;
}

/** Build the AsciiDoc directive that embeds a PNG buffer inline. */
function pngImageDirective(png: Buffer): string {
  return `image::data:image/png;base64,${png.toString('base64')}[]`;
}

/** Fallback rendering of a mermaid block as a source listing. */
function codeBlockFallback(code: string): string {
  return `[source,mermaid]\n----\n${code}\n----`;
}

/**
 * Render a single mermaid diagram to an embeddable AsciiDoc snippet for PDF
 * export: an inline PNG image, or a source listing if rendering failed.
 *
 * @param code - Mermaid diagram definition text
 * @returns AsciiDoc snippet ready to embed in the PDF source
 */
export async function renderMermaidForPdf(code: string): Promise<string> {
  const png = await renderMermaidToPng(code);
  return png ? pngImageDirective(png) : codeBlockFallback(code);
}

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
 * base64-encoded PNG images for PDF export.
 *
 * If adiagram fails to render, it falls back to a source listing rather than
 * breaking the export.
 *
 * @param content - Raw AsciiDoc content
 * @returns Processed content with mermaid blocks replaced by inline PNG images
 */
export async function preprocessMermaidBlocksForPdf(
  content: string,
): Promise<string> {
  const matches = [...content.matchAll(MERMAID_BLOCK_REGEX)];
  if (matches.length === 0) return content;

  const codes = matches.map((match) => match[2]);
  const pngs = await renderMermaidDiagrams(codes);

  let result = content;
  matches.forEach((match, index) => {
    const png = pngs[index];
    const replacement = png
      ? pngImageDirective(png)
      : codeBlockFallback(match[2]);
    result = result.replace(match[0], replacement);
  });

  return result;
}
