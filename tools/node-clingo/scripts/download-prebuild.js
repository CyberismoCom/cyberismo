import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import tarStream from 'tar-stream';
import { pipeline } from 'node:stream/promises';

const packageJsonPath = path.join(import.meta.dirname, '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const { binary, version } = packageJson;

const platform = process.platform;
const arch = process.arch;

const prebuildsDir = path.join(import.meta.dirname, '..', 'prebuilds');
const targetDir = path.join(prebuildsDir, `${platform}-${arch}`);
const versionFilePath = path.join(targetDir, '.version');

// --- Check if correct prebuilt binary version already exists ---
let needsDownload = true;
if (fs.existsSync(targetDir) && fs.existsSync(versionFilePath)) {
  try {
    const installedVersion = fs.readFileSync(versionFilePath, 'utf8').trim();
    if (installedVersion === version) {
      const files = fs.readdirSync(targetDir);
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
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(targetDir, { recursive: true });

  const response = await fetchUrl(url);

  if (!response.ok) {
    throw new Error(`Failed to download: Status Code ${response.status}`);
  }

  console.log('Download successful. Extracting with tar-stream...');

  const extract = tarStream.extract();

  extract.on('entry', (header, stream, next) => {
    const nameParts = header.name.split(/[\/]/).filter((p) => p);
    const strippedName = nameParts.slice(1).join(path.sep);

    if (header.type !== 'file' || !strippedName) {
      stream.resume(); // Consume the stream for non-files or root entries
      return next();
    }

    const targetPath = path.join(targetDir, strippedName);

    // Ensure parent directory exists
    fs.mkdir(path.dirname(targetPath), { recursive: true }, (mkdirErr) => {
      if (mkdirErr) return next(mkdirErr);

      const fileWriteStream = fs.createWriteStream(targetPath, {
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
  extract.on('error', (err) => {
    console.error('Error during tar-stream extraction:', err);
    // Let pipeline handle the rejection
  });

  await pipeline(response.body, zlib.createGunzip(), extract);

  console.log('Extraction complete.');

  // Write version file
  fs.writeFileSync(versionFilePath, version);
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
