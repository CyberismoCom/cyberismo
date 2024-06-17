// node
import { join } from 'node:path';

// ismo
import { copyDir } from './utils/file-utils.js';
import { Project } from './containers/project.js';

export class Import {

    constructor() { }

    /**
     * Import module to another project. This basically copies templates, workflows and cardtypes to a new project.
     * @param source Path to module that will be imported
     * @param destination Path to project that will receive the imported module
     */
    async importProject(source: string, destination: string) {
        const destinationProject = new Project(destination);
        const sourceProject = new Project(source);
        const moduleName = sourceProject.projectPrefix;
        const destinationPath = join(destinationProject.modulesFolder, moduleName);
        const sourcePath = sourceProject.resourcesFolder;

        // Do not allow modules with same prefixes.
        const currentlyUsedPrefixes = await destinationProject.projectPrefixes();
        if (currentlyUsedPrefixes.includes(moduleName)) {
            throw new Error(`Imported project includes a prefix '${moduleName}' that is already used in the project. Cannot import from '${source}'.\nRename module prefix before importing using 'cards rename'.`);
        }

        // Copy files.
        await copyDir(sourcePath, destinationPath);
    }
}