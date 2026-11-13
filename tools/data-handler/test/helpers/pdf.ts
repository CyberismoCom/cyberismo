// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

// Test-only: reading the PDFs asciidoctor-pdf renders. Other packages' tests
// import it by relative path.

import { spawnSync } from 'node:child_process';

/**
 * Whether asciidoctor-pdf can be run. CI installs the gem on every OS, so a
 * missing binary there is a failure, not a skip:
 * `describe.skipIf(!asciidoctorPdfInstalled && !process.env.CI)`.
 */
export const asciidoctorPdfInstalled =
  spawnSync('asciidoctor-pdf', ['--version'], {
    shell: process.platform === 'win32',
  }).status === 0;

/** The section headings of the document as its outline numbers them. */
export const outline = (pdf: Uint8Array) =>
  [
    ...Buffer.from(pdf)
      .toString('latin1')
      .matchAll(/\/Title <feff([0-9a-f]+)>/g),
  ]
    .map((match) => Buffer.from(match[1], 'hex').swap16().toString('utf16le'))
    .slice(1) // the document title
    .filter((heading) => heading !== 'Table of Contents');

/**
 * Whether the document holds a card: each card in it has a named destination,
 * its key.
 */
export const holdsCard = (pdf: Uint8Array, cardKey: string) =>
  new RegExp(`\\(${cardKey}\\) \\d+ 0 R`).test(
    Buffer.from(pdf).toString('latin1'),
  );
