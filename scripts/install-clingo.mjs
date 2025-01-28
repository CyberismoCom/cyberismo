// scripts/install-clingo.js

import os from 'os';
import fs from 'fs';
import https from 'https';
import { execSync } from 'child_process';
import { dirname, resolve, join } from 'path';
import { fileURLToPath } from 'url';

// Convert import.meta.url to a file path
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function getPlatformAndExtension() {
  const platform = os.platform(); // 'darwin', 'win32', 'linux'
  const arch = os.arch(); // 'x64', 'arm64', etc.

  const platformMap = {
    darwin: 'mac',
    win32: 'windows',
    linux: 'linux',
  };

  const mappedPlatform = platformMap[platform];
  if (!mappedPlatform) {
    throw new Error(`Unsupported platform: ${platform}`);
  }

  const extension = platform === 'win32' ? 'zip' : 'tar.gz';

  return { platform, arch, mappedPlatform, extension };
}

function getClingoDownloadUrl() {
  const { mappedPlatform, arch, extension } = getPlatformAndExtension();

  const baseUrl = 'https://github.com/username/clingo/releases/download/v0.0.1';

  const filename = `clingo-${mappedPlatform}-${arch}.${extension}`;

  return {
    url: `${baseUrl}/${filename}`,
    filename,
  };
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    https
      .get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(
            new Error(
              `Download failed: ${response.statusCode} ${response.statusMessage}`,
            ),
          );
          return;
        }
        response.pipe(file);
        file.on('finish', () => {
          file.close(resolve);
        });
      })
      .on('error', (err) => {
        fs.unlink(destPath, () => reject(err));
      });
  });
}

async function installVendorPackages() {
  // Feature only enabled for Windows machines!
  const { mappedPlatform } = getPlatformAndExtension();

  if (mappedPlatform !== 'windows') {
    console.log(
      'Postinstall script enabled only for Windows machines! Skipping',
    );
    process.exit(0);
  }

  try {
    const utilsLocation = resolve(__dirname, '../', 'vendor', 'utils');

    if (!fs.existsSync(utilsLocation)) {
      fs.mkdirSync(utilsLocation, { recursive: true });
    }

    /**
     * =======================
     * Clingo Installation
     * =======================
     */

    const clingoInstallationLocation = join(utilsLocation, 'clingo');
    const { url, filename } = getClingoDownloadUrl();
    const clingoArchivePath = join(utilsLocation, filename);

    console.log(`[clingo-install] Checking for existing installation`);

    if (fs.existsSync(clingoInstallationLocation)) {
      console.log(
        `[clingo-install] Existing installation detected, removing...`,
      );
      fs.rmSync(clingoInstallationLocation, { recursive: true, force: true });
    }

    console.log(`[clingo-install] Installation location ready`);
    console.log(`[clingo-install] Downloading from: ${url}`);

    await downloadFile(url, clingoArchivePath);

    console.log('[clingo-install] Download complete.');

    execSync(`tar -xzf "${clingoArchivePath}" -C "${utilsLocation}"`);

    fs.unlinkSync(clingoArchivePath);

    console.log('[clingo-install] Extraction complete.');

    /**
     * =======================
     * Graphviz Installation
     * =======================
     */
    const graphvizUrl =
      'https://gitlab.com/api/v4/projects/4207231/packages/generic/graphviz-releases/12.2.1/windows_10_cmake_Release_Graphviz-12.2.1-win64.zip';

    const graphvizBaseName = 'graphviz';
    const graphvizOriginalName = 'Graphviz-12.2.1-win64';
    const graphvizArchive = graphvizOriginalName + '.zip';
    const graphvizInstallationLocation = join(
      utilsLocation,
      graphvizBaseName,
    );
    const graphvizOriginalInstallationLocation = join(
      utilsLocation,
      graphvizOriginalName,
    );
    const graphvizArchivePath = join(utilsLocation, graphvizArchive);

    console.log(`[graphviz-install] Checking for existing installation`);

    if (fs.existsSync(graphvizInstallationLocation)) {
      console.log(
        `[graphviz-install] Existing installation detected, removing...`,
      );
      fs.rmSync(graphvizInstallationLocation, { recursive: true, force: true });
    }
    if (fs.existsSync(graphvizOriginalInstallationLocation)) {
      console.log(
        `[graphviz-install] Existing installation attempt detected, removing...`,
      );
      fs.rmSync(graphvizOriginalInstallationLocation, {
        recursive: true,
        force: true,
      });
    }

    console.log(`[graphviz-install] Installation location ready`);
    console.log(`[graphviz-install] Downloading from: ${graphvizUrl}`);

    await downloadFile(graphvizUrl, graphvizArchivePath);

    console.log('[graphviz-install] Download complete.');

    execSync(`tar -xzf "${graphvizArchivePath}" -C "${utilsLocation}"`);

    fs.rename(
      join(utilsLocation, graphvizOriginalName),
      join(utilsLocation, graphvizBaseName),
      (err) => {
        if (err) throw err;
      },
    );

    fs.unlinkSync(graphvizArchivePath);

    console.log('[graphviz-install] Extraction complete.');
  } catch (err) {
    console.error('[install] ERROR:', err);
    process.exit(1);
  }
}

installVendorPackages();
