// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AsciidoctorPdfError, Export } from '../../../src/api/export.js';
import { notExportedWarning } from '../../../src/domain/macros/index.js';
import {
  asciidoctorPdfInstalled,
  holdsCard,
  outline,
} from '../../helpers/pdf.js';
import { projects } from '../cards/fixture.js';
import {
  hiddenCaseSpec,
  hiddenCases,
  keyOf,
  titlesOf,
} from './hidden-cases.js';

const open = projects();

// Each case spawns the asciidoctor-pdf CLI, which is slow when files run together.
const SPAWN_TIMEOUT = 60000;
// Top(Sub), Other.
const spec = {
  cards: [
    { title: 'Top', content: 'Top body.', children: [{ title: 'Sub' }] },
    { title: 'Other', content: 'Other body.' },
  ],
};

// The section headings of the document, without their numbers.
const headings = (pdf: Uint8Array) =>
  outline(pdf).map((heading) => heading.replace(/^[\d.]+ /, ''));

const info = (pdf: Uint8Array, field: 'Title' | 'Author') =>
  new RegExp(`/${field} \\(([^)]*)\\)`).exec(
    Buffer.from(pdf).toString('latin1'),
  )?.[1];

describe.skipIf(!asciidoctorPdfInstalled && !process.env.CI)(
  'export.pdf',
  () => {
    afterEach(() => {
      vi.restoreAllMocks();
      vi.unstubAllEnvs();
    });

    it(
      'renders a PDF titled and signed as asked, and by default as Title and Name',
      async () => {
        const { ws } = await open(spec);

        const given = (await ws.export.pdf({ title: 'Report', name: 'Ann' }))
          .pdf;
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
        expect(await render({ cardKey: keys[0] })).toEqual(['Top']);
        expect(await render({ cardKey: keys[0], recursive: true })).toEqual([
          'Top',
          'Sub',
        ]);
      },
      SPAWN_TIMEOUT,
    );

    // Early, the first chapter, and Gone, with Gone leaf, are hidden.
    const hiddenSpec = {
      cards: [
        { title: 'Early' },
        {
          title: 'Top',
          children: [
            { title: 'Kid' },
            {
              title: 'Gone',
              children: [{ title: 'Gone leaf' }],
            },
            { title: 'After' },
          ],
        },
        { title: 'Other' },
      ],
      calculations: {
        hide: 'hiddenInTreeView(C) :- field(C, "title", "Early").\nhiddenInTreeView(C) :- field(C, "title", "Gone").\n',
      },
    };

    it(
      'holds the hidden cards when asked, unnumbered and out of the table of contents and bookmarks',
      async () => {
        const { ws, keys } = await open(hiddenSpec);
        const [early, , kid, gone, goneLeaf] = keys;

        const { pdf, warnings } = await ws.export.pdf({ includeHidden: true });

        // Numbered without a gap where the hidden cards are
        expect(outline(pdf)).toEqual([
          '1. Top',
          '1.1. Kid',
          '1.2. After',
          '2. Other',
        ]);
        // A card in the document has a named destination; the table of contents
        // and the bookmarks each link to it.
        const bytes = Buffer.from(pdf).toString('latin1');
        const links = (id: string) => bytes.split(`/Dest (${id})`).length - 1;
        for (const id of [early, gone, goneLeaf]) {
          expect(holdsCard(pdf, id)).toBe(true);
          expect(links(id)).toBe(0);
        }
        expect(links(kid)).toBe(2);
        expect(warnings).toEqual([]);
      },
      SPAWN_TIMEOUT,
    );

    it(
      'numbers an export from a hidden card and its subtree as visible chapters',
      async () => {
        const { ws, keys } = await open(hiddenSpec);

        const { pdf, warnings } = await ws.export.pdf({
          cardKey: keys[3],
          recursive: true,
          includeHidden: true,
        });

        expect(outline(pdf)).toEqual(['1. Gone', '1.1. Gone leaf']);
        expect(warnings).toEqual([]);
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

          expect(headings(pdf)).toEqual(['Other']);
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
  },
);

// The cards the report query puts in the document, read from the AsciiDoc
// source; asciidoctor-pdf itself is not run.
describe('export.pdf cards', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // The AsciiDoc source the PDF would be rendered from.
  const sourceOf = async (render: () => Promise<unknown>) => {
    const run = vi
      .spyOn(
        Export.prototype as unknown as {
          runAsciidoctorPdf: (content: string) => Promise<unknown>;
        },
        'runAsciidoctorPdf',
      )
      .mockResolvedValue({ pdf: Buffer.from(''), warnings: [] });
    await render();
    return run.mock.calls[0][0];
  };

  it.each(hiddenCases)(
    '$name',
    async ({
      hidden,
      start,
      recursive = true,
      includeHidden,
      exported,
      markedHidden = [],
    }) => {
      const { ws, keys } = await open(hiddenCaseSpec(hidden));

      const source = await sourceOf(() =>
        ws.export.pdf({
          ...(start ? { cardKey: keyOf(keys, start), recursive } : {}),
          includeHidden,
        }),
      );
      // Each card starts at its anchor, a hidden one after its attribute list.
      const anchors = (pattern: RegExp) =>
        titlesOf(
          keys,
          [...source.matchAll(pattern)].map((match) => match[1]),
        );
      expect(anchors(/^\[\[(\S+)\]\]$/gm)).toEqual([...exported].sort());
      expect(
        anchors(/^\[toclevels=0,outlinelevels=0\]\n+\[\[(\S+)\]\]$/gm),
      ).toEqual([...markedHidden].sort());
      // Numbering is turned off right before each hidden card and back on right
      // before each visible one; without hidden cards it is left alone.
      if (!includeHidden) {
        expect(source).not.toContain(':sectnums');
      } else {
        const marks = [
          ...source.matchAll(/^(:sectnums!?:)$|^\[\[(\S+)\]\]$/gm),
        ].map(([, mark, key]) => mark ?? titlesOf(keys, [key])[0]);
        expect(marks).toEqual(
          marks
            .filter((mark) => !mark.startsWith(':'))
            .flatMap((title) => [
              markedHidden.includes(title) ? ':sectnums!:' : ':sectnums:',
              title,
            ]),
        );
      }
    },
  );

  it('orders children with the same rank by key, each before its own children', async () => {
    // Top(S1(C1), ..., S6(C6)), the children all of one rank.
    const subs = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'];
    const { ws, keys } = await open({
      cards: [
        {
          title: 'Top',
          children: subs.map((title) => ({
            title,
            fields: { rank: '0|a' },
            children: [{ title: `C${title}` }],
          })),
        },
      ],
    });
    const byKey = subs
      .map((_, index) => [keys[1 + 2 * index], keys[2 + 2 * index]])
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .flat();

    const source = await sourceOf(() => ws.export.pdf({}));

    // Each card starts at its anchor.
    expect(
      [...source.matchAll(/^\[\[(\S+)\]\]$/gm)].map((match) => match[1]),
    ).toEqual([keys[0], ...byKey]);
  });

  it('makes a card below the top a chapter, its descendants sections below it', async () => {
    const { ws, keys } = await open(hiddenCaseSpec([]));

    const source = await sourceOf(() =>
      ws.export.pdf({ cardKey: keyOf(keys, 'Gone'), recursive: true }),
    );

    // The card titles, at their levels in the document, in document order.
    expect(source.match(/^=+ (Gone|GoneLeaf)$/gm)).toEqual([
      '== Gone',
      '=== GoneLeaf',
    ]);
  });
});

// Links to a card the document does not hold, read from the AsciiDoc source.
describe('export.pdf links outside the document', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders them as text and warns once', async () => {
    // Top(Sub) links to Other.
    const { ws, keys } = await open({
      linkTypes: [{ name: 'rel' }],
      cards: [
        {
          title: 'Top',
          links: [{ linkType: 'rel', to: 2 }],
          children: [{ title: 'Sub' }],
        },
        { title: 'Other' },
      ],
    });
    const [, sub, other] = keys;
    await ws.cards.edit(
      keys[0],
      `See xref:${other}.adoc[that], xref:${other}.adoc[], ` +
        `{{#xref}}"cardKey": "${other}"{{/xref}} and xref:${sub}.adoc[Sub].`,
    );
    const run = vi
      .spyOn(
        Export.prototype as unknown as {
          runAsciidoctorPdf: (content: string) => Promise<unknown>;
        },
        'runAsciidoctorPdf',
      )
      .mockResolvedValue({ pdf: Buffer.from(''), warnings: [] });

    const { warnings } = await ws.export.pdf({
      cardKey: keys[0],
      recursive: true,
    });

    const source: string = run.mock.calls[0][0];
    expect(source).toContain(`See that, Other, Other and <<${sub},Sub>>.`);
    expect(source).toMatch(/^\| rel out \| Other$/m);
    expect(source).not.toContain(other);
    expect(warnings).toEqual([notExportedWarning(other)]);
  });

  it('shows a link to a connector item with no address as its title', async () => {
    const { ws, keys } = await open({
      linkTypes: [{ name: 'rel' }],
      cards: [
        {
          title: 'Top',
          fields: {
            externalLinks: [
              {
                linkType: 'test/linkTypes/rel',
                connector: 'jira',
                externalItemKey: 'P-1',
                direction: 'outbound',
              },
            ],
          },
        },
      ],
    });
    const run = vi
      .spyOn(
        Export.prototype as unknown as {
          runAsciidoctorPdf: (content: string) => Promise<unknown>;
        },
        'runAsciidoctorPdf',
      )
      .mockResolvedValue({ pdf: Buffer.from(''), warnings: [] });

    const { warnings } = await ws.export.pdf({ cardKey: keys[0] });

    const source: string = run.mock.calls[0][0];
    const row = source.split('\n').find((line) => line.startsWith('| rel out'));
    expect(row).toBeDefined();
    expect(row).not.toMatch(/xref:|<<|P-1\[/);
    expect(warnings).toEqual([]);
  });

  it('keeps links to a card the document includes', async () => {
    // Top(Sub) links to Other, and includes it.
    const { ws, keys } = await open({
      linkTypes: [{ name: 'rel' }],
      cards: [
        {
          title: 'Top',
          links: [{ linkType: 'rel', to: 2 }],
          children: [{ title: 'Sub' }],
        },
        { title: 'Other' },
      ],
    });
    const other = keys[2];
    await ws.cards.edit(
      keys[0],
      `See xref:${other}.adoc[that].\n\n` +
        `{{#include}}"cardKey": "${other}"{{/include}}\n`,
    );
    const run = vi
      .spyOn(
        Export.prototype as unknown as {
          runAsciidoctorPdf: (content: string) => Promise<unknown>;
        },
        'runAsciidoctorPdf',
      )
      .mockResolvedValue({ pdf: Buffer.from(''), warnings: [] });

    const { warnings } = await ws.export.pdf({
      cardKey: keys[0],
      recursive: true,
    });

    const source: string = run.mock.calls[0][0];
    expect(source).toContain(`[[${other}]]`);
    expect(source).toContain(`See <<${other},that>>.`);
    expect(source).toMatch(
      new RegExp(`^\\| rel out \\| <<${other},Other>>$`, 'm'),
    );
    expect(warnings).toEqual([]);
  });

  it.each([
    { includeHidden: true, kept: true },
    { includeHidden: false, kept: false },
  ])(
    'with includeHidden $includeHidden, keeps links to a hidden child only when the document holds it',
    async ({ includeHidden, kept }) => {
      // Top(Hidden) links to Hidden.
      const { ws, keys } = await open({
        linkTypes: [{ name: 'rel' }],
        cards: [
          {
            title: 'Top',
            links: [{ linkType: 'rel', to: 1 }],
            children: [{ title: 'Hidden' }],
          },
        ],
        calculations: {
          hide: 'hiddenInTreeView(C) :- field(C, "title", "Hidden").\n',
        },
      });
      const hidden = keys[1];
      await ws.cards.edit(keys[0], `See xref:${hidden}.adoc[that].`);
      const run = vi
        .spyOn(
          Export.prototype as unknown as {
            runAsciidoctorPdf: (content: string) => Promise<unknown>;
          },
          'runAsciidoctorPdf',
        )
        .mockResolvedValue({ pdf: Buffer.from(''), warnings: [] });

      const { warnings } = await ws.export.pdf({
        cardKey: keys[0],
        recursive: true,
        includeHidden,
      });

      const source: string = run.mock.calls[0][0];
      if (kept) {
        expect(source).toContain(`See <<${hidden},that>>.`);
        expect(source).toMatch(
          new RegExp(`^\\| rel out \\| <<${hidden},Hidden>>$`, 'm'),
        );
        expect(warnings).toEqual([]);
      } else {
        expect(source).toContain('See that.');
        expect(source).toMatch(/^\| rel out \| Hidden$/m);
        expect(warnings).toEqual([notExportedWarning(hidden)]);
      }
    },
  );
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
