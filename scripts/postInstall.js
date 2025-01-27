const fs = require('fs');
const { execSync } = require('child_process');
const https = require('https');
const path = require('path');

async function downloadUrlToFile(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, (response) => {
            response.pipe(file);
            file.on('finish', () => {
                file.close(resolve);
            });
        }).on('error', (err) => {
            fs.unlink(dest, () => reject(err));
        });
    });
}

async function installAnaconda() {
    const filename = 'Anaconda3-2024.10-1-Windows-x86_64.exe';
    const url = 'https://repo.anaconda.com/archive/' + filename;

    // Check if the file already exists in the current directory
    if (fs.existsSync(filename)) {
        console.log('Anaconda installer already exists');
    } else {
        console.log('Downloading Anaconda installer...');
        await downloadUrlToFile(url, filename);
        console.log('Anaconda installer downloaded');
    }

    execSync(filename + ' /AddToPath=1 /RegisterPython=0 /S /D=%UserProfile%\\Anaconda3', { shell: true });
    fs.unlinkSync(filename);
}

function installClingo(condaCommand) {
    // Use conda to install clingo in cyberismo environment
    execSync(`${condaCommand} install -n cyberismo -c conda-forge clingo -y`, { shell: true });
    console.log('Clingo installed');
}

function isExecutableAvailable(executable) {
    try {
        execSync(`where ${executable}`);
        return true;
    } catch (error) {
        return false;
    }
}

function isCondaPackageInstalled(package) {
    try {
        const output = execSync(`${condaCommand} list -n cyberismo ${package}`).toString();
        return output.includes(package);
    } catch (error) {
        return false;
    }
}

function createOrUpdateEnvironment(condaCommand) {
    console.log('Creating/updating Cyberismo conda environment...');
    const stdout = execSync(`${condaCommand} create -n cyberismo -c conda-forge clingo -y`, { shell: true }).toString();
    console.log('Cyberismo conda environment OK');
}

(async () => {
    let condaCommand = 'conda';

    if (process.platform == 'win32') {
        console.log('Checking if Anaconda is installed...');
        if (isExecutableAvailable('anaconda')) {
            console.log('Anaconda already installed.');
        } else {
            console.log('Anaconda not installed. Installing Anaconda...');
            await installAnaconda();
            console.log('Anaconda installation complete.');

            condaCommand = path.join(process.env.USERPROFILE, 'Anaconda3', 'Scripts', 'conda.exe');
            console.log('Assuming conda is installed at ' + condaCommand);
        }

        createOrUpdateEnvironment(condaCommand);

        console.log('Checking if Clingo is installed...');
        if (isCondaPackageInstalled('clingo')) {
            console.log('Clingo already installed');
        } else {
            console.log('Clingo not installed. Installing Clingo...');
            installClingo(condaCommand);
        }
    }
})();
