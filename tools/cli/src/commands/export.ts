// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { mkdir, truncate, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import cliProgress from 'cli-progress';
import { Argument, type Command } from 'commander';

import { exportSite } from '@cyberismo/backend';
import { formatProjectErrors } from '@cyberismo/model';
import {
  AsciidoctorPdfError,
  ExportFormats,
  localFolder,
  type Workspace,
} from '@cyberismo/data-handler';
import type { AdocFiles } from '@cyberismo/model';

import { CommandWithPath } from '../lib/args.js';
import { onProject } from '../lib/errors.js';
import { handleResponse, printResult } from '../lib/output.js';
import type { ExportCommandOptions } from '../options.js';

// Writes the PDF of a card (or the project) to 'destination'.
async function exportPdf(
  ws: Workspace,
  destination: string,
  cardKey: string | undefined,
  options: ExportCommandOptions,
): Promise<string> {
  let rendered;
  try {
    // 'recursive' is not passed, and 'version' is read rather than
    // '--doc-version'; both kept as they were under the dispatcher.
    rendered = await ws.export.pdf({
      title: options.title,
      name: options.name,
      version: options.version,
      revremark: options.revremark,
      cardKey,
      date: options.date,
    });
  } catch (error) {
    if (error instanceof AsciidoctorPdfError) {
      throw new Error([error.message, ...error.diagnostics].join('\n'), {
        cause: error,
      });
    }
    throw error;
  }
  const { pdf, warnings } = rendered;
  await writeFile(destination, pdf);
  const summary =
    warnings.length === 1
      ? ' with 1 rendering warning'
      : warnings.length > 1
        ? ` with ${warnings.length} rendering warnings`
        : '';
  return `Content exported as PDF to ${destination}${summary}`;
}

// Writes the AsciiDoc export of a card (or the project) into 'destination'.
async function exportAdoc(
  ws: Workspace,
  destination: string,
  cardKey: string | undefined,
): Promise<string> {
  const files: AdocFiles = await ws.export.adoc(cardKey);
  // The document's imagesdir exists even when no card has attachments.
  await mkdir(join(destination, 'a'), { recursive: true });
  const document = join(destination, 'index.adoc');
  let message: string;
  try {
    await truncate(document, 0);
    message = `Using existing output file '${document}'`;
  } catch {
    message = `Creating output file '${document}'`;
  }
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(destination, path)), { recursive: true });
    await writeFile(join(destination, path), content);
  }
  return message;
}

export function registerExport(program: Command) {
  // Export command
  const exportCmd = new CommandWithPath('export').description(
    'Export a project or a card',
  );
  program.addCommand(exportCmd);
  exportCmd
    .addArgument(
      new Argument('<format>', 'Export format').choices(
        Object.values(ExportFormats),
      ),
    )
    .argument('<output>', 'Output path')
    .argument(
      '[cardKey]',
      'Export a specific card by card key. If omitted, exports the whole site.',
    )
    .option(
      '-r, --recursive',
      'Export cards under the specified card recursively',
    )
    .option(
      '-t, --title [title]',
      'Title of the exported document(pdf export only)',
    )
    .option(
      '-n, --name [name]',
      'Name of the exported document(pdf export only)',
    )
    .option(
      '-d, --date [date]',
      'Date of the exported document(pdf export only)',
    )
    .option(
      '--doc-version [version]',
      'Version of the exported document(pdf export only)',
    )
    .option(
      '-m, --revremark [revremark]',
      'Revision remark of the exported document(pdf export only)',
    )
    .option(
      '--default-project <prefix>',
      'Default project prefix for exported site (site export only)',
    )
    .action(
      async (
        format: string,
        output: ExportFormats,
        cardKey: string,
        options: ExportCommandOptions,
      ) => {
        if (format === 'site') {
          const progress = new cliProgress.SingleBar(
            {},
            cliProgress.Presets.shades_classic,
          );
          try {
            const projectPath = options.projectPath
              ? resolve(options.projectPath)
              : process.cwd();
            const { directory, failed } = await localFolder(projectPath);
            const projects = await directory.list();
            if (projects.length === 0 && failed.length === 0) {
              handleResponse({
                statusCode: 400,
                message: `No projects found in '${projectPath}'.`,
              });
              return;
            }
            const defaultProjectFailed = failed.some(
              (f) => f.prefix === options.defaultProject,
            );
            if (projects.length === 0 || defaultProjectFailed) {
              handleResponse({
                statusCode: 500,
                message: `Export failed:\n${formatProjectErrors(failed)}`,
              });
              return;
            }
            const { errors: exportErrors } = await exportSite(
              directory,
              output,
              {
                recursive: options.recursive,
                cardKey: cardKey,
                defaultProject: options.defaultProject,
              },
              (current?: number, total?: number) => {
                if (!progress.isActive && total !== undefined) {
                  progress.start(total, 0);
                }
                if (total !== undefined && progress.getTotal() !== total) {
                  progress.setTotal(total);
                }
                if (current !== undefined) {
                  progress.update(current);
                }
              },
            );
            progress.stop();
            const errors = [...failed, ...exportErrors];
            if (errors.length > 0) {
              handleResponse({
                statusCode: 500,
                message: `Export completed with errors:\n${formatProjectErrors(errors)}`,
              });
              return;
            }
            console.log('Exported site to', output);
            console.log(`Run 'cyberismo preview ${output}' to view the site`);
            return;
          } catch (e) {
            handleResponse({
              statusCode: 500,
              message: e instanceof Error ? e.message : String(e),
            });
          } finally {
            progress.stop();
          }
        }
        const merged = Object.assign({}, options, program.opts());
        printResult(
          await onProject(merged, (ws) =>
            format === 'pdf'
              ? exportPdf(ws, output, cardKey, merged)
              : exportAdoc(ws, output, cardKey),
          ),
        );
      },
    );
}
