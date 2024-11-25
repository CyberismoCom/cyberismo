const execSync = require('child_process').execSync;
const fs = require('fs');
const path = require('path')

function findFileOrFolder(rootDirectory, item) {
    var stdout = '';

    if(process.platform == 'win32') {
        stdout = execSync(`cd ${rootDirectory} & dir /s /b ${item}`, [], { cwd: rootDirectory }).toString().trim();
    }

    return stdout;
}


if(process.platform == 'win32') {
    const https = require('https'); // or 'https' for https:// URLs
    const envPath = process.env.PATH;

    if (envPath && envPath.includes('anaconda')) {
        console.log('Anaconda already installed.');
    } else {
        const filename = 'Anaconda3-2024.10-1-Windows-x86_64.exe'
        const url = 'https://repo.anaconda.com/archive/' + filename
        const fileStream = fs.createWriteStream(filename);

        const request = https.get(url, function(response) {
            response.pipe(fileStream);

            fileStream.on('finish', () => {
                fileStream.close();

                console.log('Download completed');
            });

            fileStream.on('close', () => {
                var stdout = execSync(filename + ' /AddToPath=1 /RegisterPython=1 /S');
                console.log('Anaconda installed')

                fs.unlinkSync(filename);

                if (envPath && envPath.includes('clingo')) {
                    console.log('Clingo already installed');
                } else {
                    /*
                     * Find path to conda to create environment for clingo
                     */
                    var condaBinary = 'conda.bat'
                    const pathVariable = execSync('powershell.exe "Write-Output (Get-ItemProperty -Path HKCU:\Environment -Name Path).Path"').toString().split(';');

                    pathVariable.every (item => {
                        const filename = `${item}\\${condaBinary}`;

                        if (fs.existsSync(filename)) {
                            condaBinary = filename;
                            return false;
                        }

                        return true;
                    });

                    /*
                     * This will create cyberismo environment in conda. 
                     * Environment can be activated from commandline:
                     * > conda cyberismo activate
                     */
                    const stdout = execSync(`${condaBinary} create -n cyberismo -c conda-forge clingo -y`);
                    console.log('Cyberismo conda environment created');

                    /*
                     * When environment is created, stdout will contain clingo
                     * and python package details. These details will be used
                     * to set clingo and python paths to PATH environment 
                     * variable.
                     */
                    var setPaths = [];
                    var anacondaPath = ''

                    pathVariable.every (item => {
                        if (item.endsWith('anaconda3')) {
                            anacondaPath = item;
                            return false;
                        }

                        return true;
                    });

                    stdout.toString().split('\n').every ( line => {
                        const parts = line.split('::');
                        if (parts.length > 1) {
                            const part = parts.at(-1).trim()

                            if (part.includes('python-')) {
                                const pythonPath = findFileOrFolder(anacondaPath, part);
                                setPaths.push(pythonPath);

                            } else if (part.includes('clingo-')) {
                                const clingoPath = findFileOrFolder(anacondaPath, part);
                                const clingoBinary = findFileOrFolder(clingoPath, 'clingo.exe');
                                
                                setPaths.push(path.dirname(clingoBinary));
                            }
                        }

                        return true;
                    });

                    /*
                     * Set clingo and python to user path environment 
                     * variable to be available from command line
                     */
                    setPaths.every (path => {
                        execSync(`powershell.exe scripts\\setPathVariable.ps1 -AddPath ${path}`);
                        return true;
                    });

                    console.log('Clingo installed');
                }

            });
        });
    }
}
