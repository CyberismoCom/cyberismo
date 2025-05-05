/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2025

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  mkdir,
  dirname,
  createWriteStream,
} from 'node:fs';
import { resolve, join, sep } from 'node:path';
import { createGunzip } from 'node:zlib';
import { extract } from 'tar-stream';
import { pipeline } from 'node:stream/promises';

const packageJsonPath = resolve(import.meta.dirname, '..', 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
const { binary, version } = packageJson;

const platform = process.platform;
const arch = process.arch;

const prebuildsDir = join(import.meta.dirname, '..', 'prebuilds');
const targetDir = join(prebuildsDir, `${platform}-${arch}`);
const versionFilePath = join(targetDir, '.version');

// --- Check if correct prebuilt binary version already exists ---
let needsDownload = true;
if (existsSync(targetDir) && existsSync(versionFilePath)) {
  try {
    const installedVersion = readFileSync(versionFilePath, 'utf8').trim();
    if (installedVersion === version) {
      const files = readdirSync(targetDir);
      const hasBinary = files.some(
        (file) =>
          file.endsWith('.node') ||
          file.endsWith('.dll') ||
          file.endsWith('.dylib'),
      );
      if (hasBinary) {
        console.log(
          `Correct version (${version}) of prebuilt binary already exists for ${platform}-${arch} at ${targetDir}`,
        );
        needsDownload = false;
      } else {
        console.log(
          'Version file exists but binary is missing. Redownloading...',
        );
      }
    } else {
      console.log(
        `Version mismatch (found ${installedVersion}, expected ${version}). Redownloading...`,
      );
    }
  } catch (err) {
    console.warn(
      `Error reading version file: ${err.message}. Redownloading...`,
    );
  }
} else {
  console.log(
    'Prebuilt binary directory or version file missing. Downloading...',
  );
}

if (!needsDownload) {
  process.exit(0); // Exit successfully
}
// --- End check ---

// Construct package name and URL
const packageName = binary.package_name
  .replace('{platform}', platform)
  .replace('{arch}', arch);
const remotePath = binary.remote_path
  .replace('{version}', version)
  .replace('{package_name}', packageName);
const url = `${binary.host}/${remotePath}/${packageName}`;

console.log(`Attempting to download prebuilt binary from: ${url}`);

try {
  // Clean and ensure target directory exists before download/extraction
  console.log(`Ensuring clean target directory: ${targetDir}`);
  rmSync(targetDir, { recursive: true, force: true });
  mkdirSync(targetDir, { recursive: true });

  const response = await fetchUrl(url);

  if (!response.ok) {
    throw new Error(`Failed to download: Status Code ${response.status}`);
  }

  console.log('Download successful. Extracting with tar-stream...');

  const extractor = extract();

  extractor.on('entry', (header, stream, next) => {
    const nameParts = header.name.split(/[\/]/).filter((part) => part);
    const strippedName = nameParts.slice(1).join(sep);

    if (header.type !== 'file' || !strippedName) {
      stream.resume(); // Consume the stream for non-files or root entries
      return next();
    }

    const targetPath = join(targetDir, strippedName);

    // Ensure parent directory exists
    mkdir(dirname(targetPath), { recursive: true }, (mkdirErr) => {
      if (mkdirErr) return next(mkdirErr);

      const fileWriteStream = createWriteStream(targetPath, {
        mode: header.mode,
      });

      fileWriteStream.on('finish', next);
      fileWriteStream.on('error', (writeErr) => next(writeErr));
      stream.on('error', (entryErr) =>
        fileWriteStream.close(() => next(entryErr)),
      );

      stream.pipe(fileWriteStream);
    });
  });

  // Error handling for the extractor itself
  extractor.on('error', (err) => {
    console.error('Error during tar-stream extraction:', err);
    // Let pipeline handle the rejection
  });

  await pipeline(response.body, createGunzip(), extractor);

  console.log('Extraction complete.');

  // Write version file
  writeFileSync(versionFilePath, version);
  console.log(`Wrote version ${version} to ${versionFilePath}`);

  console.log(`Prebuilt binary should be available at ${targetDir}`);
} catch (error) {
  console.error(
    `Failed to download or extract prebuilt binary: ${error.message}`,
  );
  // Exit with a non-zero code to allow fallback to node-gyp-build
  process.exit(1);
}

async function fetchUrl(url) {
  try {
    const response = await fetch(url);
    return response; // Return the full response object
  } catch (error) {
    throw new Error(`Download failed: ${error.message}`);
  }
}
