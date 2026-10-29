#!/usr/bin/env node
// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { Option } from 'commander';

import { SCHEMA_VERSION } from '@cyberismo/data-handler';

import { registerAdd } from './commands/add.js';
import { registerApp } from './commands/app.js';
import { registerCalc } from './commands/calc.js';
import { registerClean } from './commands/clean.js';
import { registerCreate } from './commands/create.js';
import { registerEdit } from './commands/edit.js';
import { registerExport } from './commands/export.js';
import { registerFetch } from './commands/fetch.js';
import { registerImport } from './commands/import.js';
import { registerInstallSkills } from './commands/install-skills.js';
import { registerMigrate } from './commands/migrate.js';
import {
  registerCheckUpdates,
  registerModule,
  registerUpdateModules,
} from './commands/module.js';
import { registerMove } from './commands/move.js';
import { registerPreview } from './commands/preview.js';
import { registerPublish } from './commands/publish.js';
import { registerRank } from './commands/rank.js';
import { registerRemove } from './commands/remove.js';
import { registerRename } from './commands/rename.js';
import { registerReport } from './commands/report.js';
import { registerShow } from './commands/show.js';
import { registerTransition } from './commands/transition.js';
import { registerUpdate } from './commands/update.js';
import { registerValidate } from './commands/validate.js';
import { program } from './lib/program.js';

// To avoid duplication, fetch description and version from package.json file.
// Importing dynamically allows filtering of warnings in cli/bin/run.
const packageDef = (await import('../package.json', { with: { type: 'json' } }))
  .default;

// Main CLI program.
program
  .name('cyberismo')
  .description(packageDef.description)
  .version(
    `cyberismo version: ${packageDef.version}\nSchema version: ${SCHEMA_VERSION}`,
    '-v, --version',
    'Output the version information',
  )
  .helpOption('-h, --help', 'Display help for command')
  .addOption(
    new Option('-L, --log-level <level>', 'Set the log level')
      .choices(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
      .default('fatal'),
  )
  .option('--autocommit', 'Enable git-backed transactional writes')
  .option('--autopush', 'Push autocommitted changes to the remote');

registerAdd(program);
registerCalc(program);
registerCreate(program);
registerEdit(program);
registerExport(program);
registerFetch(program);
registerImport(program);
registerMigrate(program);
registerModule(program);
registerMove(program);
registerPreview(program);
registerRank(program);
registerRemove(program);
registerRename(program);
registerReport(program);
registerShow(program);
registerTransition(program);
registerUpdate(program);
registerUpdateModules(program);
registerCheckUpdates(program);
registerValidate(program);
registerInstallSkills(program);
registerApp(program);
registerPublish(program);
registerClean(program);

export default program;
