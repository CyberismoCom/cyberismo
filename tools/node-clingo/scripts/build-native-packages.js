/* globals console, process */

/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2025

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';

// Map of supported native package names to their os/cpu/libc and a human
// readable description. The seven entries here MUST match the umbrella's
// optionalDependencies block once it lands.
const TARGETS = {
  '@cyberismo/node-clingo-linux-x64-gnu': {
    os: 'linux',
    cpu: 'x64',
    libc: 'glibc',
    description: 'Linux x64 (glibc) native binary for @cyberismo/node-clingo',
  },
  '@cyberismo/node-clingo-linux-x64-musl': {
    os: 'linux',
    cpu: 'x64',
    libc: 'musl',
    description: 'Linux x64 (musl) native binary for @cyberismo/node-clingo',
  },
  '@cyberismo/node-clingo-linux-arm64-gnu': {
    os: 'linux',
    cpu: 'arm64',
    libc: 'glibc',
    description: 'Linux arm64 (glibc) native binary for @cyberismo/node-clingo',
  },
  '@cyberismo/node-clingo-linux-arm64-musl': {
    os: 'linux',
    cpu: 'arm64',
    libc: 'musl',
    description: 'Linux arm64 (musl) native binary for @cyberismo/node-clingo',
  },
  '@cyberismo/node-clingo-darwin-x64': {
    os: 'darwin',
    cpu: 'x64',
    description: 'macOS x64 native binary for @cyberismo/node-clingo',
  },
  '@cyberismo/node-clingo-darwin-arm64': {
    os: 'darwin',
    cpu: 'arm64',
    description: 'macOS arm64 native binary for @cyberismo/node-clingo',
  },
  '@cyberismo/node-clingo-win32-x64': {
    os: 'win32',
    cpu: 'x64',
    description: 'Windows x64 native binary for @cyberismo/node-clingo',
  },
};

const [, , targetName] = process.argv;

if (!targetName) {
  console.error(
    'Usage: node scripts/build-native-packages.js <target-package-name>\n' +
      `  <target-package-name> must be one of:\n${Object.keys(TARGETS)
        .map((n) => `    ${n}`)
        .join('\n')}`,
  );
  process.exit(1);
}

if (!Object.prototype.hasOwnProperty.call(TARGETS, targetName)) {
  console.error(
    `Unknown target package name "${targetName}".\n  Expected one of:\n${Object.keys(
      TARGETS,
    )
      .map((n) => `    ${n}`)
      .join('\n')}`,
  );
  process.exit(1);
}

const target = TARGETS[targetName];

const pkgRoot = resolve(import.meta.dirname, '..');
const repoRoot = resolve(pkgRoot, '..', '..');
const umbrellaPkgPath = resolve(pkgRoot, 'package.json');
const umbrellaPkg = JSON.parse(readFileSync(umbrellaPkgPath, 'utf8'));
const version = umbrellaPkg.version;

const nativeBinarySrc = resolve(
  pkgRoot,
  'build',
  'Release',
  'node-clingo.node',
);
if (!existsSync(nativeBinarySrc)) {
  console.error(
    `Missing native binary at ${nativeBinarySrc}.\n` +
      `  Build it first with:\n` +
      `    pnpm --filter @cyberismo/node-clingo run build:native`,
  );
  process.exit(1);
}

const thirdPartySrc = resolve(pkgRoot, 'THIRD-PARTY.txt');
if (!existsSync(thirdPartySrc)) {
  console.error(`Missing THIRD-PARTY.txt at ${thirdPartySrc}.`);
  process.exit(1);
}

const licenseSrc = resolve(repoRoot, 'LICENSE');
if (!existsSync(licenseSrc)) {
  console.error(`Missing root LICENSE at ${licenseSrc}.`);
  process.exit(1);
}

const templatesDir = resolve(pkgRoot, 'scripts', 'templates');
const pkgTemplatePath = resolve(templatesDir, 'sub-package.json');
const readmeTemplatePath = resolve(templatesDir, 'sub-package.README.md');

const outputDir = resolve(pkgRoot, 'dist-packages', targetName);
mkdirSync(outputDir, { recursive: true });

// Copy binary + license + third-party notices into the package directory.
copyFileSync(nativeBinarySrc, resolve(outputDir, 'node-clingo.node'));
copyFileSync(thirdPartySrc, resolve(outputDir, 'THIRD-PARTY.txt'));
copyFileSync(licenseSrc, resolve(outputDir, 'LICENSE.md'));

// Build the per-platform package.json from the template. The template stores
// placeholder values inside a fully valid JSON object; we parse it, do
// string-level substitutions on every leaf, then conditionally insert the
// `libc` field for Linux targets only. This keeps the template human-
// readable in editors that lint JSON while letting the script handle the
// optional `libc` array cleanly.
const placeholders = {
  '{{NAME}}': targetName,
  '{{VERSION}}': version,
  '{{OS}}': target.os,
  '{{CPU}}': target.cpu,
  '{{DESCRIPTION}}': target.description,
};

function substitute(value) {
  if (typeof value === 'string') {
    let out = value;
    for (const [k, v] of Object.entries(placeholders)) {
      out = out.split(k).join(v);
    }
    return out;
  }
  if (Array.isArray(value)) {
    return value.map(substitute);
  }
  if (value && typeof value === 'object') {
    const result = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = substitute(v);
    }
    return result;
  }
  return value;
}

const subPkgTemplate = JSON.parse(readFileSync(pkgTemplatePath, 'utf8'));
const subPkg = substitute(subPkgTemplate);

// Insert `libc` immediately after `cpu` so the field ordering matches the
// published shape on Linux targets. Darwin and Windows get no `libc` key.
if (target.libc) {
  const ordered = {};
  for (const [k, v] of Object.entries(subPkg)) {
    ordered[k] = v;
    if (k === 'cpu') {
      ordered.libc = [target.libc];
    }
  }
  writeFileSync(
    resolve(outputDir, 'package.json'),
    JSON.stringify(ordered, null, 2) + '\n',
  );
} else {
  writeFileSync(
    resolve(outputDir, 'package.json'),
    JSON.stringify(subPkg, null, 2) + '\n',
  );
}

// Render README from its template.
let readme = readFileSync(readmeTemplatePath, 'utf8');
for (const [k, v] of Object.entries(placeholders)) {
  readme = readme.split(k).join(v);
}
writeFileSync(resolve(outputDir, 'README.md'), readme);

console.log(`Wrote dist-packages/${targetName}/`);
