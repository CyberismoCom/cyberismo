#!/usr/bin/env node

/* eslint-env node */
/* globals console */

/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2025

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { readdirSync, statSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const rootDir = resolve(import.meta.dirname, '..');
const prebuildsDir = join(rootDir, 'prebuilds');

// Ensure prebuilds directory exists
if (!existsSync(prebuildsDir)) {
  mkdirSync(prebuildsDir, { recursive: true });
}

console.log('Prebuilds directory:', prebuildsDir);
console.log('Found prebuilds:');

// List all prebuilds
const files = readdirSync(prebuildsDir);

files.forEach((file) => {
  const filePath = join(prebuildsDir, file);
  const stats = statSync(filePath);
  console.log(`  ${file} (${(stats.size / 1024).toFixed(2)} KB)`);
});

// Calculate total size
const totalSize = files.reduce((acc, file) => {
  const filePath = join(prebuildsDir, file);
  const stats = statSync(filePath);
  return acc + stats.size;
}, 0);

console.log(`\nTotal size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
console.log(`\nPrebuild files are ready for distribution!`);
