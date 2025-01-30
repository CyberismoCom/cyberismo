const fs = require('fs');
const { execFileSync } = require('child_process');
const https = require('https');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

/**
 * Dependencies for the project.
 *
 * Note: The sha256 checksums are for the files hosted at the Anaconda repository.
 * Note: win32 support is coming soon.
 */
const dependencies = {
  darwin: {
    conda: {
      name: 'Miniconda3-py312_24.11.1-0-MacOSX-x86_64.sh',
      repo: 'https://repo.anaconda.com/miniconda/',
      sha256:
        '71419eaf7f0bc016c41e8e27815609e76f2d6bcfc39426c19ca5e5cf7a2ea36f',
    },
  },
  win32: {
    conda: {
      name: 'Miniconda3-py312_24.11.1-0-Windows-x86_64.exe',
      repo: 'https://repo.anaconda.com/miniconda/',
      sha256:
        'be382fc02742c734fd3c399c5e5d322bc9b43292117827ab9aa6f7446351e45c',
    },
  },
};

/**
 * Download a file from a URL to a destination.
 *
 * @param {*} url The URL to download from
 * @param {*} dest The destination file path
 * @returns
 */
async function downloadUrlToFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https
      .get(url, (response) => {
        response.pipe(file);
        file.on('finish', () => {
          file.close(resolve);
        });
      })
      .on('error', (err) => {
        fs.unlink(dest, () => reject(err));
      });
  });
}

/**
 * Check if the SHA256 hash of a file matches the expected hash.
 * @param {*} filePath path to the file
 * @param {*} expectedHash expected SHA256 hash
 * @returns
 */
async function checkFileSha256(filePath, expectedHash) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);

    stream.on('data', (data) => {
      hash.update(data);
    });

    stream.on('end', () => {
      const calculatedHash = hash.digest('hex');
      if (calculatedHash === expectedHash) {
        resolve(true);
      } else {
        resolve(false);
      }
    });

    stream.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Install Miniconda on MacOS.
 */
async function installCondaMacOS() {
  const platform = process.platform;
  const filename = dependencies[platform].conda.name;
  const url = dependencies[platform].conda.repo + filename;

  let condaCommand = 'conda';
  // Check if the file already exists in the current directory
  if (fs.existsSync(filename)) {
    console.log('Miniconda installer already exists');
  } else {
    console.log('Downloading Miniconda installer...');
    await downloadUrlToFile(url, filename);

    console.log('Checking Miniconda installer checksum...');
    const isValid = await checkFileSha256(
      filename,
      dependencies[platform].conda.sha256,
    );
    if (!isValid) {
      throw new Error('Miniconda installer checksum does not match');
    }
    console.log('Miniconda installer downloaded and verified');
  }

  console.log('Installing Miniconda...');

  // Installation target is in the project vendor directory, which might not exist
  const vendorDir = path.join(__dirname, '..', 'vendor');
  if (!fs.existsSync(vendorDir)) {
    fs.mkdirSync(vendorDir);
  }

  execFileSync('sh', [filename, '-b', '-p', path.join(vendorDir, 'miniconda3')]);

  // Removing the installer
  console.log('Removing Miniconda installer...');
  fs.unlinkSync(filename);

  // Set the condaCommand to the path of the installed conda executable
  condaCommand = path.join(vendorDir, 'miniconda3', 'bin', 'conda');

  return condaCommand;
}

/**
 * Install Clingo using conda.
 * @param {*} condaCommand path to the conda executable
 */
function installClingo(condaCommand) {
  // Use conda to install clingo in cyberismo environment
  execFileSync(condaCommand, ['install', '-n', 'cyberismo', '-c', 'conda-forge', 'clingo', '-y']);
  console.log('Clingo installed');
}

/**
 * Check if an executable is available in the PATH.
 * @param {*} executable name of the executable
 * @returns true if the executable is available, false otherwise
 */
function isExecutableAvailable(executable) {
  try {
    const command =
      process.platform === 'win32'
        ? `where ${executable}`
        : `which ${executable}`;
    execSync(command);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Check if a conda package is installed in the cyberismo environment.
 * @param {*} condaCommand path to the conda executable
 * @param {*} package name of the package
 * @returns true if the package is installed, false otherwise
 */
function isCondaPackageInstalled(condaCommand, package) {
  try {
    const output = execFileSync(condaCommand, ['list', '-n', 'cyberismo', package]).toString();
    return output.includes(package);
  } catch (error) {
    return false;
  }
}

/**
 * Create the Cyberismo conda environment if it does not exist.
 * @param {*} condaCommand path to the conda executable
 */
function createCondaEnvironment(condaCommand) {
  console.log('Checking if Cyberismo conda environment exists...');

  if (execFileSync(condaCommand, ['env', 'list'], { stdio: 'pipe' }).toString().includes('^cyberismo')) {
    console.log('Cyberismo conda environment already exists');
    return;
  }

  console.log('Cyberismo conda environment not found. Creating...');
  execFileSync(condaCommand, ['env', 'create', '-f', 'environment.yml', '-y']);
  console.log('Cyberismo conda environment created');
}

/**
 * Main function to install dependencies.
 */
(async () => {
  let condaCommand = 'conda';

  if (process.platform == 'darwin') {
    console.log('Checking if Miniconda is installed...');
    if (fs.existsSync(path.join(__dirname, '..', 'vendor', 'miniconda3'))) {
      console.log('Miniconda already installed.');
      condaCommand = path.join(
        __dirname,
        '..',
        'vendor',
        'miniconda3',
        'bin',
        'conda',
      );
    } else {
      console.log('Miniconda not installed. Installing Miniconda...');
      condaCommand = await installCondaMacOS();
      console.log('Miniconda installation complete.');
    }

    console.log('Conda is installed at ' + condaCommand);

    createCondaEnvironment(condaCommand);

    console.log('Checking if Clingo is installed...');
    if (isCondaPackageInstalled(condaCommand, 'clingo')) {
      console.log('Clingo already installed');
    } else {
      console.log('Clingo not installed. Installing Clingo...');
      installClingo(condaCommand);
    }

    console.log('Dependencies installed successfully.');
    console.log(
      '--------------------------------------------------------------------------------',
    );
    console.log('Ensure that you have the following in your shell profile:');
    console.log(
      'export PATH=$PATH:"' +
        path.join(__dirname, '..', 'vendor', 'miniconda3', 'bin') +
        '"',
    );
    console.log();
    console.log('For example: ');
    console.log(
      'echo \'export PATH=$PATH:"' +
        path.join(__dirname, '..', 'vendor', 'miniconda3', 'bin') +
        '"\' >> ~/.zprofile',
    );
    console.log();
    console.log('Without starting a new shell, you can set the path with');
    console.log('source ~/.zprofile');
    console.log();
    console.log(
      'When using Cyberismo, remember to activate the environment with',
    );
    console.log('source activate cyberismo');
    console.log(
      '--------------------------------------------------------------------------------',
    );
  } else {
    console.error('ERROR: Unsupported platform: ' + process.platform);
    process.exit(1);
  }
})();
