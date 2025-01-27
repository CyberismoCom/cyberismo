// scripts/install-clingo.js

const os = require('os');
const fs = require('fs');
const path = require('path');
const https = require('https');
const childProcess = require('child_process');
const { execSync } = childProcess;

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

function getDownloadUrl() {
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

async function installClingo() {
  try {
    const utilsLocation = path.resolve(process.cwd(), 'vendor', 'utils');

    if (!fs.existsSync(utilsLocation)) {
      fs.mkdirSync(utilsLocation, { recursive: true });
    }

    /**
     * =======================
     * Clingo Installation
     * =======================
     */
    const { url, filename } = getDownloadUrl();

    console.log(`[clingo-install] Downloading from: ${url}`);

    const clingoArchivePath = path.join(utilsLocation, filename);

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
    const graphvizFilename = 'graphviz.zip';

    console.log(`[graphviz-install] Downloading from: ${graphvizUrl}`);

    const graphvizArchivePath = path.join(utilsLocation, graphvizFilename);

    await downloadFile(graphvizUrl, graphvizArchivePath);

    console.log('[graphviz-install] Download complete.');

    execSync(`tar -xzf "${graphvizArchivePath}" -C "${utilsLocation}"`);

    fs.rename(
      path.join(utilsLocation, 'Graphviz-12.2.1-win64'),
      path.join(utilsLocation, 'graphviz'),
      (err) => {
        console.log(err);
      },
    );

    fs.unlinkSync(graphvizArchivePath);
    console.log('[graphviz-install] Extraction complete.');
  } catch (err) {
    console.error('[install] ERROR:', err);
    process.exit(1);
  }
}

installClingo();
