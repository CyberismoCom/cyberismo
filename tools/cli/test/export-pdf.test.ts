// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

// `cyberismo export pdf` rendered by the real asciidoctor-pdf. The transcript
// tests cover the command's options with a stub instead.

import { execFile, spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  buildProject,
  type BuiltProject,
} from '../../data-handler/test/helpers/project-builder.js';

const bin = join(import.meta.dirname, '..', 'bin', 'run');

// CI installs the gem on every OS, so a missing binary there is a failure, not a skip.
const installed =
  spawnSync('asciidoctor-pdf', ['--version'], {
    shell: process.platform === 'win32',
  }).status === 0;

// The section headings of the document as its outline numbers them.
const outline = (pdf: Buffer) =>
  [...pdf.toString('latin1').matchAll(/\/Title <feff([0-9a-f]+)>/g)]
    .map((match) => Buffer.from(match[1], 'hex').swap16().toString('utf16le'))
    .slice(1) // the document title
    .filter((heading) => heading !== 'Table of Contents');

// The text runs of the document's pages. asciidoctor-pdf leaves the page
// content uncompressed and writes each run as hex strings, which its fonts
// encode byte for byte for these titles.
const texts = (pdf: Buffer) =>
  [...pdf.toString('latin1').matchAll(/(<[0-9a-f]*>) Tj|\[([^\]]*)\] TJ/g)]
    .map((match) =>
      [...(match[1] ?? match[2]).matchAll(/<([0-9a-f]*)>/g)]
        .map((hex) => Buffer.from(hex[1], 'hex').toString('latin1'))
        .join(''),
    )
    .filter((text) => text !== '');

describe.skipIf(!installed && !process.env.CI)(
  'export pdf with asciidoctor-pdf',
  { timeout: 120000 },
  () => {
    let project: BuiltProject;
    let alpha: string;

    // Alpha(Shown, Gone(Gone leaf), After), Beta; Gone is hidden from the tree view.
    beforeAll(async () => {
      project = await buildProject({
        cards: [
          {
            title: 'Alpha',
            children: [
              { title: 'Shown' },
              { title: 'Gone', children: [{ title: 'Gone leaf' }] },
              { title: 'After' },
            ],
          },
          { title: 'Beta' },
        ],
        calculations: {
          hide: 'hiddenInTreeView(C) :- field(C, "title", "Gone").\n',
        },
      });
      [alpha] = project.keys;
    });
    afterAll(() => project.cleanup());

    const exportPdf = async (output: string, ...options: string[]) => {
      const { error, stderr } = await new Promise<{
        error: Error | null;
        stderr: string;
      }>((resolve) =>
        execFile(
          process.execPath,
          [bin, 'export', 'pdf', output, alpha, '-r', ...options],
          { cwd: project.path },
          (error, _stdout, stderr) => resolve({ error, stderr }),
        ),
      );
      expect(error, stderr).toBeNull();
      return readFile(join(project.path, output));
    };

    it('holds the hidden cards with --include-hidden, out of the outline', async () => {
      const pdf = await exportPdf('with-hidden.pdf', '--include-hidden');

      // Numbered without a gap where the hidden card is
      expect(outline(pdf)).toEqual(['1. Alpha', '1.1. Shown', '1.2. After']);
      // The hidden cards are in the body, unnumbered
      expect(texts(pdf)).toEqual(
        expect.arrayContaining(['Gone', 'Gone leaf', '1.2. After']),
      );
    });

    it('leaves the hidden cards out without --include-hidden', async () => {
      const pdf = await exportPdf('without-hidden.pdf');

      expect(outline(pdf)).toEqual(['1. Alpha', '1.1. Shown', '1.2. After']);
      expect(texts(pdf)).toContain('1.2. After');
      expect(texts(pdf).filter((text) => text.includes('Gone'))).toEqual([]);
    });
  },
);
