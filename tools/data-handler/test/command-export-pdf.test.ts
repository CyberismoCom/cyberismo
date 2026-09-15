import { expect, it, describe, beforeAll, afterAll } from 'vitest';
import { join } from 'node:path';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { copyDir } from '../src/utils/file-utils.js';
import { CommandManager } from '../src/command-manager.js';
import type { Export } from '../src/commands/index.js';
import type { ExportPdfOptions } from '../src/interfaces/project-interfaces.js';

describe('PDF export — AsciiDoc source assembly', () => {
  const baseDir = import.meta.dirname;
  const testDir = join(baseDir, 'tmp-export-pdf-tests');
  const decisionRecordsPath = join(testDir, 'valid/decision-records');
  let commands: CommandManager;
  let exportCmd: Export;

  beforeAll(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data/', testDir);
    commands = new CommandManager(decisionRecordsPath, {});
    await commands.initialize();
    exportCmd = commands.exportCmd;

    // Put a native xref from decision_6 (child) to decision_5 (root) into the
    // body of decision_6 so it flows through the PDF assembly pipeline.
    await commands.editCmd.editCardContent(
      'decision_6',
      'Body. See xref:decision_5.adoc[Parent decision] for context.',
    );
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('rewrites native xref:KEY.adoc[label] to <<KEY,label>> anchor xref', async () => {
    const options: ExportPdfOptions = {
      name: 'decision-records',
      title: 'Decision Records',
    };

    const source = await (
      exportCmd as unknown as {
        buildPdfAsciidocSource: (o: ExportPdfOptions) => Promise<string>;
      }
    ).buildPdfAsciidocSource(options);

    expect(source).toContain('<<decision_5,Parent decision>>');
    expect(source).not.toContain('xref:decision_5.adoc[Parent decision]');
  });
});

// Each case spawns the asciidoctor-pdf CLI, which overruns the default timeout
// when the suite runs several files at once.
const PDF_SPAWN_TIMEOUT = 60000;

describe('PDF export - asciidoctor safe mode', () => {
  const baseDir = import.meta.dirname;
  const testDir = join(baseDir, 'tmp-export-pdf-safe-mode-tests');
  const decisionRecordsPath = join(testDir, 'valid/decision-records');
  let outsideDir: string;
  let commands: CommandManager;
  let exportCmd: Export;

  const options: ExportPdfOptions = {
    name: 'decision-records',
    title: 'Decision Records',
    cardKey: 'decision_5',
    recursive: false,
  };

  beforeAll(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data/', testDir);
    outsideDir = mkdtempSync(join(tmpdir(), 'cyberismo-pdf-safe-'));
    commands = new CommandManager(decisionRecordsPath, {});
    await commands.initialize();
    exportCmd = commands.exportCmd;
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
    rmSync(outsideDir, { recursive: true, force: true });
    delete process.env.CYBERISMO_PDF_SAFE_MODE_CANARY;
  });

  // The canary is an inline anchor, so a leak becomes a named destination that
  // appears verbatim in the PDF bytes rather than as font-encoded text.
  it.runIf(process.platform === 'linux')(
    'does not leak the process environment into the PDF',
    async () => {
      process.env.CYBERISMO_PDF_SAFE_MODE_CANARY = '[[env_leak_canary_qqz]]';
      await commands.editCmd.editCardContent(
        'decision_5',
        '== Testing\ninclude::/proc/self/environ[]\n',
      );

      const pdf = await exportCmd.exportPdfBuffer(options);

      expect(pdf.toString('latin1')).not.toContain('env_leak_canary_qqz');
    },
    PDF_SPAWN_TIMEOUT,
  );

  it(
    'does not read files outside the project into the PDF',
    async () => {
      const secretFile = join(outsideDir, 'secret.adoc');
      writeFileSync(secretFile, '== File Leak Canary Zzx\n');
      await commands.editCmd.editCardContent(
        'decision_5',
        `== Testing\ninclude::${secretFile}[]\n`,
      );

      const pdf = await exportCmd.exportPdfBuffer(options);

      expect(pdf.toString('latin1')).not.toContain('file_leak_canary_zzx');
    },
    PDF_SPAWN_TIMEOUT,
  );

  // Neither an SVG's text nor an imported PDF's text survives into the raw bytes,
  // so the image vectors below assert on structure instead. asciidoctor-pdf writes
  // image XObjects as the literal ASCII `/Subtype /Image`, and the page tree's
  // `/Count` is literal ASCII too, so an imported page is visible without a parser.
  // The Cyberismo theme contributes a fixed number of both, so every probe is
  // compared against a control export made in the same run rather than a constant.
  const imageCount = (pdf: Buffer) =>
    pdf.toString('latin1').split('/Subtype /Image').length - 1;

  const pageCount = (pdf: Buffer) =>
    Number(/\/Count (\d+)/.exec(pdf.toString('latin1'))?.[1] ?? -1);

  // 1x1 PNG; a leak shows up as an extra image XObject in the output.
  const CANARY_PNG_BASE64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  const exportWithContent = async (content: string) => {
    await commands.editCmd.editCardContent('decision_5', content);
    return exportCmd.exportPdfBuffer(options);
  };

  const writeCanaryPng = () => {
    const pngFile = join(outsideDir, 'canary.png');
    writeFileSync(pngFile, Buffer.from(CANARY_PNG_BASE64, 'base64'));
    return pngFile;
  };

  it(
    'does not render an SVG from outside the project',
    async () => {
      // prawn-svg draws the SVG's own <image> element, so a leak is countable.
      const svgFile = join(outsideDir, 'canary.svg');
      writeFileSync(
        svgFile,
        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="120" height="60">' +
          '<image width="30" height="30" xlink:href="data:image/png;base64,' +
          CANARY_PNG_BASE64 +
          '"/></svg>',
      );

      const control = await exportWithContent('== Testing\n\nNo image here.\n');
      const probe = await exportWithContent(
        `== Testing\n\nimage::${svgFile}[]\n`,
      );

      expect(imageCount(probe)).toBe(imageCount(control));
    },
    PDF_SPAWN_TIMEOUT,
  );

  it(
    'does not import a PDF from outside the project as a block image',
    async () => {
      // A block image whose format is pdf reaches import_page, so the PDF-page
      // import primitive is available without any cover attribute.
      const pdfFile = join(outsideDir, 'block.pdf');
      writeFileSync(
        pdfFile,
        await exportWithContent('== Testing\n\nSource.\n'),
      );

      const control = await exportWithContent('== Testing\n\nBody.\n');
      const probe = await exportWithContent(
        `== Testing\n\nimage::${pdfFile}[]\n`,
      );

      expect(pageCount(probe)).toBe(pageCount(control));
      expect(imageCount(probe)).toBe(imageCount(control));
    },
    PDF_SPAWN_TIMEOUT,
  );

  it(
    'does not import a PDF from outside the project as a cover page',
    async () => {
      // front-cover-image is only read from the document header, which card
      // content cannot reach -- but the export name lands on the header's author
      // line, so a newline there injects header attribute entries.
      const coverFile = join(outsideDir, 'cover.pdf');
      writeFileSync(
        coverFile,
        await exportWithContent('== Testing\n\nCover.\n'),
      );

      const control = await exportWithContent('== Testing\n\nBody.\n');
      const probe = await exportCmd.exportPdfBuffer({
        ...options,
        name: `${options.name}\n:front-cover-image: image:${coverFile}[]`,
      });

      expect(pageCount(probe)).toBe(pageCount(control));
      expect(imageCount(probe)).toBe(imageCount(control));
    },
    PDF_SPAWN_TIMEOUT,
  );

  it(
    'does not resolve an image through an attribute reference to an absolute path',
    async () => {
      writeCanaryPng();

      const control = await exportWithContent('== Testing\n\nNo image here.\n');
      const probe = await exportWithContent(
        `:d: ${outsideDir}\n\n== Testing\n\nimage::{d}/canary.png[]\n`,
      );

      expect(imageCount(probe)).toBe(imageCount(control));
    },
    PDF_SPAWN_TIMEOUT,
  );

  it(
    'does not honour an imagesdir override from card content',
    async () => {
      writeCanaryPng();

      const control = await exportWithContent('== Testing\n\nNo image here.\n');
      const probe = await exportWithContent(
        `== Testing\n\n:imagesdir: ${outsideDir}\n\nimage::canary.png[]\n`,
      );

      expect(imageCount(probe)).toBe(imageCount(control));
    },
    PDF_SPAWN_TIMEOUT,
  );

  it(
    'does not embed a video poster from outside the project',
    async () => {
      const pngFile = writeCanaryPng();

      const control = await exportWithContent(
        '== Testing\n\nvideo::movie.mp4[]\n',
      );
      const probe = await exportWithContent(
        `== Testing\n\nvideo::movie.mp4[poster=${pngFile}]\n`,
      );

      expect(imageCount(probe)).toBe(imageCount(control));
    },
    PDF_SPAWN_TIMEOUT,
  );

  it(
    'does not embed an admonition icon from outside the project',
    async () => {
      // The icon attribute resolves with relative_to = nil, so it takes the
      // absolute-path branch even though icons=font is locked on the command line.
      const pngFile = writeCanaryPng();

      const control = await exportWithContent(
        '== Testing\n\n[NOTE]\nNote body.\n',
      );
      const probe = await exportWithContent(
        `== Testing\n\n[NOTE,icon=${pngFile}]\nNote body.\n`,
      );

      expect(imageCount(probe)).toBe(imageCount(control));
    },
    PDF_SPAWN_TIMEOUT,
  );
});
