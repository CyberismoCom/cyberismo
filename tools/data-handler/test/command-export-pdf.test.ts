import { expect, it, describe, beforeAll, afterAll } from 'vitest';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

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
    commands = new CommandManager(decisionRecordsPath, {
      autoSaveConfiguration: false,
    });
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
