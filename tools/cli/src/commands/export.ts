/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2024
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { mkdir, truncate, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import cliProgress from 'cli-progress';
import { Argument, type Command } from 'commander';

import { exportSite, ProjectRegistry } from '@cyberismo/backend';
import { formatProjectErrors } from '@cyberismo/model';
import {
  AsciidoctorPdfError,
  type CommandOptions,
  ExportFormats,
  scanForProjects,
  type Workspace,
} from '@cyberismo/data-handler';
import type { AdocFiles } from '@cyberismo/model';

import { CommandWithPath } from '../lib/args.js';
import { onProject } from '../lib/errors.js';
import { handleResponse, printResult } from '../lib/output.js';

// Writes the PDF of a card (or the project) to 'destination'.
async function exportPdf(
  ws: Workspace,
  destination: string,
  cardKey: string | undefined,
  options: CommandOptions<'export'>,
): Promise<string> {
  let rendered;
  try {
    // The dispatcher never passed 'recursive', and reads 'version' rather
    // than '--doc-version'; both kept as they were.
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
        options: CommandOptions<'export'>,
      ) => {
        if (format === 'site') {
          const progress = new cliProgress.SingleBar(
            {},
            cliProgress.Presets.shades_classic,
          );
          // Should be in commandHandler, once it is moved under the CLI package
          try {
            const projectPath = options.projectPath
              ? resolve(options.projectPath)
              : process.cwd();
            const projects = await scanForProjects(projectPath);
            if (projects.length === 0) {
              handleResponse({
                statusCode: 400,
                message: `No projects found in '${projectPath}'.`,
              });
              return;
            }
            const { registry, failed } =
              await ProjectRegistry.fromScannedProjects(projects);
            const defaultProjectFailed = failed.some(
              (f) => f.prefix === options.defaultProject,
            );
            if (registry.list().length === 0 || defaultProjectFailed) {
              handleResponse({
                statusCode: 500,
                message: `Export failed:\n${formatProjectErrors(failed)}`,
              });
              return;
            }
            const { errors: exportErrors } = await exportSite(
              registry,
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
