// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AsciidoctorPdfError, Export } from '../../../src/api/export.js';
import { projects } from '../cards/fixture.js';

const open = projects();

// Each case spawns the asciidoctor-pdf CLI, which is slow when files run together.
const SPAWN_TIMEOUT = 60000;
// CI installs the gem on every OS, so a missing binary there is a failure, not a skip.
const installed =
  spawnSync('asciidoctor-pdf', ['--version'], {
    shell: process.platform === 'win32',
  }).status === 0;

// Top(Sub), Other.
const spec = {
  cards: [
    { title: 'Top', content: 'Top body.', children: [{ title: 'Sub' }] },
    { title: 'Other', content: 'Other body.' },
  ],
};

// The section headings of the document as its outline numbers them.
const outline = (pdf: Uint8Array) =>
  [
    ...Buffer.from(pdf)
      .toString('latin1')
      .matchAll(/\/Title <feff([0-9a-f]+)>/g),
  ]
    .map((match) => Buffer.from(match[1], 'hex').swap16().toString('utf16le'))
    .slice(1) // the document title
    .filter((heading) => heading !== 'Table of Contents');

// The section headings of the document, without their numbers.
const headings = (pdf: Uint8Array) =>
  outline(pdf).map((heading) => heading.replace(/^[\d.]+ /, ''));

// The number of pages in the document.
const pages = (pdf: Uint8Array) =>
  /\/Kids \[([^\]]*)\]\n\/Type \/Pages/
    .exec(Buffer.from(pdf).toString('latin1'))![1]
    .match(/\d+ 0 R/g)!.length;

const info = (pdf: Uint8Array, field: 'Title' | 'Author') =>
  new RegExp(`/${field} \\(([^)]*)\\)`).exec(
    Buffer.from(pdf).toString('latin1'),
  )?.[1];

describe.skipIf(!installed && !process.env.CI)('export.pdf', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it(
    'renders a PDF titled and signed as asked, and by default as Title and Name',
    async () => {
      const { ws } = await open(spec);

      const given = (await ws.export.pdf({ title: 'Report', name: 'Ann' })).pdf;
      const defaults = (await ws.export.pdf({})).pdf;

      expect(Buffer.from(given).subarray(0, 5).toString()).toBe('%PDF-');
      expect([info(given, 'Title'), info(given, 'Author')]).toEqual([
        'Report',
        'Ann',
      ]);
      expect([info(defaults, 'Title'), info(defaults, 'Author')]).toEqual([
        'Title',
        'Name',
      ]);
    },
    SPAWN_TIMEOUT,
  );

  it(
    'holds the whole tree, parents before children, or one card, with or without its descendants',
    async () => {
      const { ws, keys } = await open(spec);

      const render = async (options: object) =>
        headings(
          (await ws.export.pdf({ title: 'T', name: 'N', ...options })).pdf,
        );

      expect(await render({})).toEqual(['Top', 'Sub', 'Other']);
      // An exported card is the document, so not a heading in it
      expect(await render({ cardKey: keys[0] })).toEqual([]);
      expect(await render({ cardKey: keys[0], recursive: true })).toEqual([
        'Sub',
      ]);
    },
    SPAWN_TIMEOUT,
  );

  it(
    'makes an exported card the document, titled by it, with its sections and children as the chapters',
    async () => {
      const { ws, keys } = await open({
        cards: [
          {
            title: 'Top',
            children: [
              {
                title: 'Mid',
                content: '== Detail\n\nText.',
                children: [{ title: 'Leaf A' }, { title: 'Leaf B' }],
              },
            ],
          },
        ],
      });

      const { pdf, warnings } = await ws.export.pdf({
        cardKey: keys[1],
        recursive: true,
        showMetadata: false,
      });

      expect(info(pdf, 'Title')).toBe('Mid');
      expect(outline(pdf)).toEqual(['1. Detail', '2. Leaf A', '3. Leaf B']);
      // Title page, table of contents, and a page per chapter
      expect(pages(pdf)).toBe(5);
      expect(warnings).toEqual([]);
    },
    SPAWN_TIMEOUT,
  );

  it(
    "lists a card's own sections in the outline, under the card and before its children",
    async () => {
      const { ws, keys } = await open(spec);
      await ws.cards.edit(
        keys[0],
        '== Background\n\nText.\n\n=== Detail\n\nMore.\n\n== Scope\n\nText.',
      );

      const { pdf, warnings } = await ws.export.pdf({
        cardKey: keys[0],
        recursive: true,
      });

      expect(outline(pdf)).toEqual([
        '1. Background',
        '1.1. Detail',
        '2. Scope',
        '3. Sub',
      ]);
      expect(warnings).toEqual([]);
    },
    SPAWN_TIMEOUT,
  );

  it(
    'makes the sections of a card that starts them from = its chapters, like those from ==',
    async () => {
      const { ws, keys } = await open(spec);
      await ws.cards.edit(
        keys[0],
        '= Background\n\nText.\n\n== Detail\n\nMore.\n\n= Scope\n\nText.',
      );

      const { pdf, warnings } = await ws.export.pdf({
        cardKey: keys[0],
        recursive: true,
        showMetadata: false,
      });

      expect(outline(pdf)).toEqual([
        '1. Background',
        '1.1. Detail',
        '2. Scope',
        '3. Sub',
      ]);
      // Title page, table of contents, and a page per chapter
      expect(pages(pdf)).toBe(5);
      expect(warnings).toEqual([]);
    },
    SPAWN_TIMEOUT,
  );

  it(
    'lists five levels in the table of contents, or as many as asked',
    async () => {
      const { ws } = await open(spec);
      const run = vi.spyOn(
        Export.prototype as unknown as {
          runAsciidoctorPdf: (content: string) => Promise<unknown>;
        },
        'runAsciidoctorPdf',
      );

      await ws.export.pdf({});
      await ws.export.pdf({ tocLevels: 2 });

      const [byDefault, asked] = run.mock.calls.map(([content]) => content);
      expect(byDefault).toContain(':toclevels: 5\n');
      expect(asked).toContain(':toclevels: 2\n');
    },
    SPAWN_TIMEOUT,
  );

  it('refuses table of contents levels outside 1 to 5', async () => {
    const { ws } = await open(spec);

    for (const tocLevels of [0, 6, 2.5, NaN]) {
      await expect(ws.export.pdf({ tocLevels })).rejects.toThrow(
        'Table of contents levels must be a whole number from 1 to 5',
      );
    }
  });

  it(
    'shows the metadata table of each card unless asked not to',
    async () => {
      const { ws } = await open(spec);
      const run = vi.spyOn(
        Export.prototype as unknown as {
          runAsciidoctorPdf: (content: string) => Promise<unknown>;
        },
        'runAsciidoctorPdf',
      );

      await ws.export.pdf({});
      await ws.export.pdf({ showMetadata: false });

      const [shown, hidden] = run.mock.calls.map(([content]) => content);
      expect(shown).toContain('| Workflow state |');
      expect(hidden).not.toContain('| Workflow state |');
      expect(hidden).toContain('Top body.');
    },
    SPAWN_TIMEOUT,
  );

  it(
    'reports the rendering warnings rather than printing them',
    async () => {
      const { ws, keys } = await open(spec);
      await ws.cards.edit(keys[0], 'See xref:test_zzzzzzzz.adoc[Gone].');
      const stderr = vi.spyOn(process.stderr, 'write');
      const warn = vi.spyOn(console, 'warn');

      const { warnings } = await ws.export.pdf({ cardKey: keys[0] });

      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('test_zzzzzzzz');
      expect(stderr).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
    },
    SPAWN_TIMEOUT,
  );

  it(
    'turns a link to an exported card into a link inside the document',
    async () => {
      const { ws, keys } = await open(spec);
      await ws.cards.edit(keys[0], `See xref:${keys[2]}.adoc[Other].`);

      const { pdf, warnings } = await ws.export.pdf({});

      expect(warnings).toEqual([]);
      const bytes = Buffer.from(pdf).toString('latin1');
      expect(bytes).toContain(`/Dest (${keys[2]})`);
      expect(bytes).not.toContain(`/URI (${keys[2]}.pdf)`);
    },
    SPAWN_TIMEOUT,
  );

  // Card content is untrusted: neither include:: nor a path in it may read a server file.
  describe('with hostile card content', () => {
    const dirs: string[] = [];
    afterEach(() => {
      for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true });
    });

    it(
      'does not include a file from outside the project',
      async () => {
        const { ws, keys } = await open(spec);
        const outside = mkdtempSync(join(tmpdir(), 'pdf-outside-'));
        dirs.push(outside);
        writeFileSync(join(outside, 'secret.adoc'), '== Leaked heading\n');
        await ws.cards.edit(
          keys[2],
          `include::${join(outside, 'secret.adoc')}[]`,
        );

        const { pdf } = await ws.export.pdf({ cardKey: keys[2] });

        // The exported card is the document, so any heading is the included one
        expect(headings(pdf)).toEqual([]);
      },
      SPAWN_TIMEOUT,
    );

    // The canary is an anchor, so a leak is a named destination in the bytes.
    it.runIf(process.platform === 'linux')(
      'does not put the environment of the process into the document',
      async () => {
        const { ws, keys } = await open(spec);
        vi.stubEnv('PDF_EXPORT_CANARY', '[[env_leak_canary_qqz]]');
        await ws.cards.edit(keys[2], 'include::/proc/self/environ[]');

        const { pdf } = await ws.export.pdf({ cardKey: keys[2] });

        expect(Buffer.from(pdf).toString('latin1')).not.toContain(
          'env_leak_canary_qqz',
        );
      },
      SPAWN_TIMEOUT,
    );

    it(
      'does not take a cover from a file the export name names',
      async () => {
        const { ws, keys } = await open(spec);
        const outside = mkdtempSync(join(tmpdir(), 'pdf-outside-'));
        dirs.push(outside);
        const cover = join(outside, 'cover.pdf');
        const pages = (pdf: Uint8Array) =>
          Number(
            /\/Count (\d+)/.exec(Buffer.from(pdf).toString('latin1'))?.[1],
          );
        const control = (await ws.export.pdf({ cardKey: keys[2], name: 'N' }))
          .pdf;
        writeFileSync(cover, control);

        // The name reaches the header, where a newline starts an attribute.
        const { pdf } = await ws.export.pdf({
          cardKey: keys[2],
          name: `N\n:front-cover-image: image:${cover}[]`,
        });

        expect(pages(pdf)).toBe(pages(control));
      },
      SPAWN_TIMEOUT,
    );

    it(
      'does not take its images from a directory the card names',
      async () => {
        const { ws, keys } = await open(spec);
        const outside = mkdtempSync(join(tmpdir(), 'pdf-outside-'));
        dirs.push(outside);
        writeFileSync(
          join(outside, 'dot.png'),
          Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
            'base64',
          ),
        );
        const images = async (content: string) => {
          await ws.cards.edit(keys[2], content);
          const { pdf } = await ws.export.pdf({ cardKey: keys[2] });
          return Buffer.from(pdf).toString('latin1').split('/Subtype /Image')
            .length;
        };
        const control = await images('No image.');

        expect(
          await images(`:imagesdir: ${outside}\n\nimage::dot.png[]\n`),
        ).toBe(control);
      },
      SPAWN_TIMEOUT,
    );
  });
});

// A stand-in for asciidoctor-pdf found first on the PATH.
describe.skipIf(process.platform === 'win32')('export.pdf failing', () => {
  const path = process.env.PATH;
  const dirs: string[] = [];
  afterEach(() => {
    process.env.PATH = path;
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true });
  });

  function standIn(script: string) {
    const dir = mkdtempSync(join(tmpdir(), 'pdf-bin-'));
    dirs.push(dir);
    const file = join(dir, 'asciidoctor-pdf');
    writeFileSync(file, `#!/bin/sh\n${script}\n`);
    chmodSync(file, 0o755);
    process.env.PATH = `${dir}${delimiter}${path}`;
  }

  it('raises the diagnostics apart from the message, the last twenty lines of them', async () => {
    const { ws } = await open(spec);
    standIn(
      'cat >/dev/null; for i in $(seq 1 30); do echo "line $i /secret/path" >&2; done; exit 3',
    );

    const error = await ws.export.pdf({}).catch((caught) => caught);

    expect(error).toBeInstanceOf(AsciidoctorPdfError);
    expect(error.message).toBe('Asciidoctor-pdf failed with code 3');
    expect(error.diagnostics).toHaveLength(20);
    expect(error.diagnostics[0]).toBe('line 11 /secret/path');
  });

  it('says asciidoctor-pdf is missing when it cannot be run', async () => {
    const { ws } = await open(spec);
    const empty = mkdtempSync(join(tmpdir(), 'pdf-bin-'));
    dirs.push(empty);
    process.env.PATH = empty;

    await expect(ws.export.pdf({})).rejects.toThrow(
      'Asciidoctor-pdf not found',
    );
  });
});
