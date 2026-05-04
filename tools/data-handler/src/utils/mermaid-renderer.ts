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
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * Regex that matches standard AsciiDoc mermaid diagram blocks.
 * Supports [mermaid], [mermaid,id], [mermaid,id,format=svg], etc.
 * Matches both literal blocks (....) and listing blocks (----).
 * Supports both LF and CRLF line endings.
 */
const MERMAID_BLOCK_REGEX =
  /\[mermaid[^\]]*\]\r?\n(\.{4,}|-{4,})\r?\n([\s\S]*?)\r?\n\1/g;

/**
 * Render mermaid code to a file using the `mmdc` CLI (mermaid-cli).
 * mmdc uses headless Chromium for pixel-perfect rendering.
 *
 * @param code - Mermaid diagram definition text
 * @param format - Output format ('png' or 'svg')
 * @returns Buffer containing the rendered output
 */
async function renderWithMmdc(
  code: string,
  format: 'png' | 'svg',
): Promise<Buffer> {
  const tempDir = await mkdtemp(join(tmpdir(), 'mermaid-'));
  const inputPath = join(tempDir, 'input.mmd');
  const outputPath = join(tempDir, `output.${format}`);

  try {
    // Unescape literal \n sequences that may come from upstream
    // processing (e.g., Handlebars/JSON serialization of report data).
    const unescaped = code.replace(/\\n/g, '\n');
    await writeFile(inputPath, unescaped, 'utf-8');

    await new Promise<void>((resolve, reject) => {
      const proc = spawn(
        'mmdc',
        ['-i', inputPath, '-o', outputPath, '-b', 'white', '-t', 'default'],
        {
          timeout: 60000,
          shell: process.platform === 'win32',
        },
      );

      let stderr = '';
      proc.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      proc.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') {
          reject(
            new Error(
              'mmdc (mermaid CLI) not found. Install with: npm install -g @mermaid-js/mermaid-cli',
            ),
          );
        } else {
          reject(error);
        }
      });

      proc.on('close', (exitCode) => {
        if (exitCode === 0) {
          resolve();
        } else {
          reject(new Error(`mmdc failed with code ${exitCode}: ${stderr}`));
        }
      });
    });

    return readFile(outputPath);
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Render a Mermaid diagram definition to SVG string using the mmdc CLI.
 * Requires `@mermaid-js/mermaid-cli` to be installed globally.
 *
 * @param code - Mermaid diagram definition text
 * @returns SVG string
 */
export async function renderMermaidToSvg(code: string): Promise<string> {
  const buffer = await renderWithMmdc(code, 'svg');
  return buffer.toString('utf-8');
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
 * base64-encoded PNG images for PDF export using the mmdc CLI.
 *
 * If mmdc is not installed, mermaid blocks are rendered as code listings
 * instead of diagrams (graceful degradation).
 *
 * @param content - Raw AsciiDoc content
 * @returns Processed content with mermaid blocks replaced by inline PNG image references
 */
export async function preprocessMermaidBlocksForPdf(
  content: string,
): Promise<string> {
  const matches = [...content.matchAll(MERMAID_BLOCK_REGEX)];
  if (matches.length === 0) return content;

  let result = content;
  let mmdcMissing = false;

  for (const match of matches) {
    const fullMatch = match[0];
    const diagramCode = match[2];

    if (mmdcMissing) {
      result = result.replace(
        fullMatch,
        `[source,mermaid]\n----\n${diagramCode}\n----`,
      );
      continue;
    }

    try {
      const pngBuffer = await renderWithMmdc(diagramCode, 'png');
      const base64 = pngBuffer.toString('base64');
      result = result.replace(
        fullMatch,
        `image::data:image/png;base64,${base64}[]`,
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes('mmdc (mermaid CLI) not found')
      ) {
        mmdcMissing = true;
        process.stderr.write(
          'Warning: mmdc not found. Mermaid diagrams will appear as code blocks in the PDF.\n' +
            'Install with: npm install -g @mermaid-js/mermaid-cli\n',
        );
      }
      result = result.replace(
        fullMatch,
        `[source,mermaid]\n----\n${diagramCode}\n----`,
      );
    }
  }

  return result;
}
