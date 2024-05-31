// node
import { join, sep } from 'node:path';

// ismo
import { copyDir, deleteDir } from './utils/file-utils.js';
import { requestStatus } from './interfaces/request-status-interfaces.js';
import { card } from './interfaces/project-interfaces.js';
import { Project } from './containers/project.js';

export class Move {
    static project: Project;

    constructor() { }

    /**
     *
     * @param path Project path
     * @param source source card to move
     * @param destination destination card where source card will be moved to; or 'root'
     * @returns request status
     *      'statusCode' 200 when card was moved successfully
     * <br> 'statusCode' 400 when input validation failed
     * <br> 'statusCode' 500 when unspecified error occurred
     */
    public async moveCard(path: string, source: string, destination: string): Promise<requestStatus> {
        Move.project = new Project(path);

        const promiseContainer = [];
        promiseContainer.push(Move.project.findSpecificCard(source));
        if (destination !== 'root') {
            promiseContainer.push(Move.project.findSpecificCard(destination));
        } else {
            const returnObject: card = {
                key: '',
                path: Move.project.cardrootFolder
            };
            promiseContainer.push(Promise.resolve(returnObject));
        }
        const [sourceCard, destinationCard] = await Promise.all(promiseContainer);

        if (!sourceCard) {
            return { statusCode: 400, message: `Card ${source} not found from project` };
        }
        if (!destinationCard) {
            return { statusCode: 400, message: `Card ${destination} not found from project` };
        }

        // Imported templates cannot be modified.
        if (destinationCard.path.includes(`${sep}modules`) || sourceCard.path.includes(`${sep}modules${sep}`)) {
            return { statusCode: 400, message: `Cannot modify imported module templates` };
        }

        const bothTemplateCards = Project.isTemplateCard(sourceCard) && Project.isTemplateCard(destinationCard);
        const bothProjectCards = Move.project.hasCard(sourceCard.key) && Move.project.hasCard(destinationCard.key);
        if (!(bothTemplateCards || bothProjectCards)) {
            return { statusCode: 400, message: `Cards cannot be moved from project to template or vice versa` };
        }

        const destinationPath = (destination === 'root')
            ? join(Move.project.cardrootFolder, sourceCard.key)
            : join(destinationCard.path, 'c', sourceCard.key);

        await copyDir(sourceCard.path, destinationPath);

        await deleteDir(sourceCard.path);
        return { statusCode: 200 };
    }
}