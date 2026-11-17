// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

// `cyberismo export pdf` rendered by the real asciidoctor-pdf. The transcript
// tests cover the command's options with a stub instead.

import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  buildProject,
  type BuiltProject,
} from '../../data-handler/test/helpers/project-builder.js';
import {
  asciidoctorPdfInstalled,
  holdsCard,
  outline,
} from '../../data-handler/test/helpers/pdf.js';

const bin = join(import.meta.dirname, '..', 'bin', 'run');

describe.skipIf(!asciidoctorPdfInstalled && !process.env.CI)(
  'export pdf with asciidoctor-pdf',
  { timeout: 120000 },
  () => {
    let project: BuiltProject;
    let alpha: string, gone: string, goneLeaf: string;

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
      [alpha, , gone, goneLeaf] = project.keys;
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
      // The hidden cards are in the document all the same
      expect(holdsCard(pdf, gone)).toBe(true);
      expect(holdsCard(pdf, goneLeaf)).toBe(true);
    });

    it('leaves the hidden cards out without --include-hidden', async () => {
      const pdf = await exportPdf('without-hidden.pdf');

      expect(outline(pdf)).toEqual(['1. Alpha', '1.1. Shown', '1.2. After']);
      expect(holdsCard(pdf, alpha)).toBe(true);
      expect(holdsCard(pdf, gone)).toBe(false);
      expect(holdsCard(pdf, goneLeaf)).toBe(false);
    });
  },
);
