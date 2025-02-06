// scripts/install-clingo.js

import os from 'os';
import fs from 'fs';
import { pipeline } from 'stream/promises';
import { spawnSync, execSync } from 'child_process';
import { dirname, resolve, join, delimiter } from 'path';
import { fileURLToPath } from 'url';

// Convert import.meta.url to a file path
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const utilsLocation = resolve(__dirname, '../vendor/utils');

const UTILS_CONFIG = {
  win32: {
    x64: [
      {
        name: 'clingo',
        installed: true,
        url: 'https://github.com/CyberismoCom/cyberismo/releases/download/v0.0.2/clingo-windows-x64.zip',
        archiveName: 'clingo-windows-x64.zip',
        extractedDirectory: 'clingo',
        bin: '.',
      },
      {
        name: 'graphviz',
        installed: true,
        url: 'https://gitlab.com/api/v4/projects/4207231/packages/generic/graphviz-releases/12.2.1/windows_10_cmake_Release_Graphviz-12.2.1-win64.zip',
        archiveName: 'Graphviz-12.2.1-win64.zip',
        extractedDirectory: 'graphviz',
        bin: 'bin',
      },
      // You can add more Windows packages here
    ],
  },
  linux: {
    x64: [
      {
        name: 'clingo',
        installed: true,
        url: 'https://github.com/CyberismoCom/cyberismo/releases/download/v0.0.2/clingo-linux-x64.tar.gz',
        archiveName: 'clingo-linux-x64.tar.gz',
        extractedDirectory: 'clingo',
        bin: '.',
      },
      {
        // Clingo subpackage
        name: 'python3.11',
        installed: true,
        extractedDirectory: 'clingo',
        bin: 'clingo_env/bin',
      },
      {
        name: 'graphviz',
        installed: false,
        verifyCommand: 'dot -V',
        ifMissing:
          'Try installing it on Ubuntu:\n  sudo apt-get update && sudo apt-get install -y graphviz',
      },
      // More Linux packages
    ],
  },
  darwin: {
    arm64: [
      {
        name: 'clingo',
        installed: true,
        url: 'https://github.com/CyberismoCom/cyberismo/releases/download/v0.0.2/clingo-mac-arm64.tar.gz',
        archiveName: 'clingo-mac-arm64.tar.gz',
        extractedDirectory: 'clingo',
        bin: '.', //root
      },
      // More macOS packages
    ],
  },
};

export function updatePathWithVendorUtils() {
  const platform = os.platform();
  const arch = os.arch();
  const osConfig = UTILS_CONFIG[platform] || {};
  const packages = osConfig[arch] || [];

  const utilsPaths = packages
    .filter((pkg) => pkg.installed)
    .map((pkg) => resolve(utilsLocation, pkg.extractedDirectory, pkg.bin));

  process.env.PATH = utilsPaths.join(delimiter) + delimiter + process.env.PATH;
}

function extractArchive(archivePath, destinationDir) {
  // Ensure the location exists
  fs.mkdirSync(destinationDir, { recursive: true });

  const result = spawnSync(
    'tar',
    ['-xzf', archivePath, '-C', destinationDir, '--strip-components=1'],
    {
      stdio: 'inherit',
    },
  );

  if (result.status !== 0) {
    throw new Error(`Extraction failed for archive ${archivePath}`);
  }
}

async function downloadFile(url, destPath) {
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': 'Node.js',
      },
    });

    if (!response.ok) {
      throw new Error(
        `Download failed: ${response.status} ${response.statusText}`,
      );
    }

    const fileStream = fs.createWriteStream(destPath);

    await pipeline(response.body, fileStream);

    console.log(`Download completed successfully: ${destPath}`);
  } catch (error) {
    fs.unlink(destPath, (err) => {
      if (err) {
        console.error(`Failed to delete incomplete file: ${destPath}`, err);
      }
    });
    console.error('Download failed:', error);
    throw error;
  }
}

function verifyInstallation(name, verifyCommand, ifMissing) {
  try {
    execSync(verifyCommand, { stdio: 'ignore' });
    console.log(`[${name}-verification] already installed.`);
    return true;
  } catch (error) {
    console.log(
      `\n[${name}-verification] not found with command '${verifyCommand}'`,
    );
    console.log(ifMissing);
    return false;
  }
}

async function installSinglePackage(pkgConfig, utilsLocation) {
  const {
    name,
    url,
    archiveName,
    extractedDirectory,
    installed,
    verifyCommand,
    ifMissing,
  } = pkgConfig;

  if (!installed) {
    verifyInstallation(name, verifyCommand, ifMissing);
    return;
  }

  if (!url) {
    return;
  }

  console.log(`[${name}-install] Installing package`);

  // 1. Ensure vendor/utils folder exists
  if (!fs.existsSync(utilsLocation)) {
    fs.mkdirSync(utilsLocation, { recursive: true });
  }

  // 2. Remove existing installation
  const finalLocation = join(utilsLocation, extractedDirectory);
  if (fs.existsSync(finalLocation)) {
    console.log(`[${name}-install] Removing existing installation...`);
    fs.rmSync(finalLocation, { recursive: true, force: true });
  }

  // 3. Download
  const archivePath = join(utilsLocation, archiveName);
  console.log(`[${name}-install] Downloading from: ${url}`);
  await downloadFile(url, archivePath);

  // 4. Extract
  console.log(`[${name}-install] Extracting to: ${utilsLocation}`);
  extractArchive(archivePath, finalLocation);

  // 5. Cleanup archive
  fs.unlinkSync(archivePath);

  console.log(`[${name}-install] Installation complete.`);
}

async function installAllUtils() {
  const platform = os.platform();
  const arch = os.arch();

  if (platform !== 'win32' && platform !== 'linux') {
    console.log(
      'Postinstall script currently only handles Windows and Linux. Skipping...',
    );
    process.exit(0);
  }

  const platformConfig = UTILS_CONFIG[platform] || {};
  const packagesToInstall = platformConfig[arch] || [];

  if (!packagesToInstall.length) {
    console.log(`No packages found for ${platform}/${arch}. Exiting...`);
    return;
  }
  const errorPackages = [];
  for (const pkg of packagesToInstall) {
    try {
      await installSinglePackage(pkg, utilsLocation);
    } catch (err) {
      errorPackages.push(pkg.name);
    }
  }
  // Finally summarize failures
  if (errorPackages.length) {
    console.log('\nThe following packages failed to install:');
    for (const pkgName of errorPackages) {
      console.log(`- ${pkgName}`);
    }
    // Optionally exit with non-zero code
    process.exit(1);
  } else {
    console.log('\nAll packages installed successfully.');
  }
}

// Run install only if called directly
if (fileURLToPath(import.meta.url) === process.argv[1]) {
  installAllUtils().catch((err) => {
    console.error('Failed to install vendor packages:', err);
    process.exit(1);
  });
}
