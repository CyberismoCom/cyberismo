// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { localFolder } from '@cyberismo/data-handler';
import { createServer } from './index.js';
import { exportSite } from './export.js';
import { MockAuthProvider } from './auth/mock.js';
import { KeycloakAuthProvider } from './auth/keycloak.js';
import type { AuthProvider } from './auth/types.js';
import { formatProjectErrors } from '@cyberismo/model';
import { gitOptionsFromEnv } from './utils.js';
import { parseArgs } from 'node:util';
import { configureLogging, type LogLevel } from '@cyberismo/node-common/log';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

function createAuthProvider(): AuthProvider {
  const authMode = process.env.AUTH_MODE;

  if (!authMode) {
    console.error(
      'Fatal: AUTH_MODE environment variable is required. Set to "mock" or "idp".',
    );
    process.exit(1);
  }

  if (authMode === 'mock') {
    return new MockAuthProvider({ roster: true });
  }

  if (authMode === 'idp') {
    const issuer = process.env.OIDC_ISSUER;
    const clientId = process.env.OIDC_CLIENT_ID;

    if (!issuer || !clientId) {
      console.error(
        'Fatal: OIDC_ISSUER and OIDC_CLIENT_ID environment variables are required when AUTH_MODE=idp.',
      );
      process.exit(1);
    }

    return new KeycloakAuthProvider({ issuer, audience: clientId });
  }

  console.error(
    `Fatal: Unrecognized AUTH_MODE "${authMode}". Must be "mock" or "idp".`,
  );
  process.exit(1);
}

const LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];

const projectPath = process.env.npm_config_project_path || process.cwd();

const { values: args } = parseArgs({
  options: {
    export: { type: 'boolean', default: false },
    'default-project': { type: 'string' },
  },
  strict: false,
});

function failToStart(error: unknown): never {
  console.error(
    error instanceof Error
      ? error.message
      : `Failed to scan for projects in '${projectPath}'`,
  );
  process.exit(1);
}

if (args.export) {
  let opened;
  try {
    opened = await localFolder(projectPath);
  } catch (error) {
    failToStart(error);
  }
  const { directory, failed } = opened;
  const projects = await directory.list();
  if (projects.length === 0 && failed.length === 0) {
    console.error('No projects found to export.');
    process.exit(1);
  }
  const defaultProject =
    typeof args['default-project'] === 'string'
      ? args['default-project']
      : undefined;
  if (
    projects.length === 0 ||
    failed.some((f) => f.prefix === defaultProject)
  ) {
    console.error(formatProjectErrors(failed));
    process.exit(1);
  }
  const { errors: exportErrors } = await exportSite(directory, undefined, {
    defaultProject,
  });
  const errors = [...failed, ...exportErrors];
  if (errors.length > 0) {
    console.error(formatProjectErrors(errors));
    process.exit(1);
  }
} else {
  const auth = createAuthProvider();
  const level = process.env.LOG_LEVEL ?? 'trace';
  if (!LOG_LEVELS.includes(level)) {
    console.error(`Fatal: Unrecognized LOG_LEVEL "${level}".`);
    process.exit(1);
  }
  configureLogging([{ stream: 'stdout', level: level as LogLevel }]);
  let failed;
  try {
    ({ failed } = await createServer(
      { projectPath, multiProject: true, ...gitOptionsFromEnv() },
      { auth },
    ));
  } catch (error) {
    failToStart(error);
  }
  if (failed.length > 0) {
    console.error(formatProjectErrors(failed));
  }
}
