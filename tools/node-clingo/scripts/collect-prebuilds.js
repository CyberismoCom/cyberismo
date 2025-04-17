#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const prebuildsDir = path.join(rootDir, 'prebuilds');

// Ensure prebuilds directory exists
if (!fs.existsSync(prebuildsDir)) {
  fs.mkdirSync(prebuildsDir, { recursive: true });
}

console.log('Prebuilds directory:', prebuildsDir);
console.log('Found prebuilds:');

// List all prebuilds
const files = fs.readdirSync(prebuildsDir);

files.forEach((file) => {
  const filePath = path.join(prebuildsDir, file);
  const stats = fs.statSync(filePath);
  console.log(`  ${file} (${(stats.size / 1024).toFixed(2)} KB)`);
});

// Calculate total size
const totalSize = files.reduce((acc, file) => {
  const filePath = path.join(prebuildsDir, file);
  const stats = fs.statSync(filePath);
  return acc + stats.size;
}, 0);

console.log(`\nTotal size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
console.log(`\nPrebuild files are ready for distribution!`);
