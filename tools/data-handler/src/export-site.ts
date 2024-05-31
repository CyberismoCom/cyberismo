// node
import fs from 'node:fs';
import { copyFile, appendFile, mkdir, writeFile } from 'node:fs/promises';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

import git from 'isomorphic-git';
import { dump } from 'js-yaml';

// ismo
import { card } from './interfaces/project-interfaces.js';
import { errorFunction } from './utils/log-utils.js';
import { Export } from './export.js';
import { Project } from './containers/project.js';
import { requestStatus } from './interfaces/request-status-interfaces.js';

export class ExportSite extends Export {

    private tmpDir: string = '';
    private moduleDir: string = '';
    private pagesDir: string = '';
    private imagesDir: string = '';
    private playbookDir: string = '';
    private playbookFile: string = '';
    private navFile: string = '';

    constructor() {
        super();
    }

    // todo: change this so that split temp folder creation to its own method.
    // then parallelize this and export() as much as you can.
    private async initDirectories(): Promise<requestStatus> {
        // Create temporary adoc output directory
        try {
            this.tmpDir = mkdtempSync(join(tmpdir(), 'cards-'));
        } catch (error) {
            return { statusCode: 500, message: errorFunction(error) };
        }

        // Antora requires the content directory to be a Git repository
        await this.initRepo();

        // Create the pages and images directories
        this.moduleDir = join(this.tmpDir, 'modules', 'ROOT');
        this.pagesDir = join(this.moduleDir, 'pages');
        this.imagesDir = join(this.moduleDir, 'assets', 'images');
        this.navFile = join(this.moduleDir, 'nav.adoc');

        const promiseContainer = [];
        promiseContainer.push(mkdir(this.pagesDir, { recursive: true }));
        promiseContainer.push(mkdir(this.imagesDir, { recursive: true }));
        await Promise.all(promiseContainer);

        // Create the playbook directory
        this.playbookDir = mkdtempSync(join(tmpdir(), 'cards-playbook-'));
        return { statusCode: 200 };
    }

    // Generate the site from the source files using Antora.
    private async generate(outputPath: string): Promise<requestStatus> {
        // Use spawnsync to npx execute the program "antora", with the argument this.playbookFile
        try {
            spawnSync('npx', ['antora', '--to-dir', outputPath, this.playbookFile], { stdio: 'inherit' });
        } catch (error) {
            return { statusCode: 500, message: errorFunction(error) };
        }
        return { statusCode: 200 };
    }

    // Create the Antora playbook.
    private async createPlaybook(cards: card[]): Promise<requestStatus> {
        let startPage: string = '';

        if (cards[0]) {
            startPage = cards[0].key + '.adoc';
        } else {
            return { statusCode: 500, message: 'Cannot create a playbook for an empty card set' };
        }

        const playbook = {
            site: {
                title: ExportSite.project.configuration.name,
                start_page: `cards:ROOT:${startPage}`
            },
            content: {
                sources: [
                    {
                        url: this.tmpDir,
                        branches: 'HEAD'
                    }
                ]
            },
            ui: {
                bundle: {
                    url: 'https://gitlab.com/antora/antora-ui-default/-/jobs/artifacts/HEAD/raw/build/ui-bundle.zip?job=bundle-stable',
                    snapshot: true
                }
            }
        }

        this.playbookFile = join(this.playbookDir, 'antora-playbook.yml');
        fs.writeFileSync(this.playbookFile, dump(playbook));
        return { statusCode: 200 };
    }

    // Create the Antora site descriptor.
    private async createDescriptor(): Promise<requestStatus> {
        const projectName = ExportSite.project.configuration.name;
        const descriptor = {
            name: 'cards',
            title: projectName,
            version: '1.0', // TODO: Use the source content commit SHA?
            nav: [
                "modules/ROOT/nav.adoc"
            ]
        }

        const descriptorPath = join(this.tmpDir, 'antora.yml');
        try {
            writeFileSync(descriptorPath, dump(descriptor));
        } catch (error) {
            return { statusCode: 500, message: errorFunction(error) };
        }
        return { statusCode: 200 };
    }

    // Initialise the temporary directory as a temporary Git repository.
    private async initRepo(): Promise<requestStatus> {
        try {
            await git.init({ fs, dir: this.tmpDir });
            writeFileSync(join(this.tmpDir, '.gitkeep'), '');
            await git.add({ fs, dir: this.tmpDir, filepath: '.gitkeep' });
        } catch (error) {
            return { statusCode: 500, message: errorFunction(error) };
        }

        try {
            await git.commit({
                fs,
                dir: this.tmpDir,
                author: {
                    name: 'Cyberismo Cards',
                    email: 'info@cyberismo.com'
                },
                message: 'Add .gitkeep'
            });
        } catch (error) {
            return { statusCode: 500, message: errorFunction(error) };
        }
        return { statusCode: 200 };
    }

    // Write cards as Antora-compatible AsciiDoc to the given location
    // @param path Directory where the cards should be written
    // @param cards Array of Cards
    // @param depth Navigation depth - this is used in recursion to format the hierarchical menu
    private async toAdocDirectoryAsContent(path: string, cards: card[], depth: number): Promise<requestStatus> {
        depth++;

        // Ensure the target path exists
        await mkdir(path, { recursive: true });
        for (const card of cards) {
            // Construct path for individual card file
            const cardPath = join(path, card.key + '.adoc');
            const cardXRef = cardPath.slice(this.pagesDir.length);
            const navFileContent = '*'.repeat(depth) + ` xref:${cardXRef}[${card.metadata?.summary}]\n`;
            await appendFile(this.navFile, navFileContent);

            let tempContent = undefined;
            if (card.metadata) {
                const cardTypeForCard = await ExportSite.project.cardType(card.metadata?.cardtype);
                tempContent = super.metaToAdoc(card, cardTypeForCard);
                tempContent += `\n== ${card.key} `;
                tempContent += (card.metadata?.summary)
                    ? `${card.metadata.summary}\n`
                    : 'Untitled\n';
            }

            if (card.content) {
                tempContent += '\n' + card.content;
            }
            if (tempContent !== undefined) {
                await writeFile(cardPath, tempContent);
            }

            if (card.children) {
                // Recurse into the child cards
                await this.toAdocDirectoryAsContent(join(path, card.key), card.children, depth);
            }

            if (card.attachments) {
                const promiseContainer = [];
                for (const attachment of card.attachments) {
                    const source = join(attachment.path, attachment.fileName);
                    const destination = join(this.imagesDir, `${attachment.fileName}`);
                    promiseContainer.push(copyFile(source, destination));
                }
                await Promise.all(promiseContainer);
            }
        }

        --depth;
        return { statusCode: 200 };
    }

    // Export the cards to the temporary directory as a full HTML site generated by Antora.
    private async export(destination: string, cards: card[]): Promise<requestStatus> {
        let status = await this.initDirectories();
        status = await this.createDescriptor();
        status = await this.toAdocDirectoryAsContent(this.pagesDir, cards, 0);
        status = await this.createPlaybook(cards);
        status = await this.generate(destination);
        return status;
    }

    /**
     * Export the card tree as an Antora site
     * @param source Cardroot path
     * @param destination Path where the site is generated
     * @param cardkey Optional; If defined exports the card tree from underneath this card.
     * @returns request status:
     * - 'statusCode' 200 when workflow was created successfully.
    */
    public async exportToSite(source: string, destination: string, cardkey?: string): Promise<requestStatus> {
        Export.project = new Project(source);
        const sourcePath: string = cardkey
            ? join(Export.project.cardrootFolder, Export.project.pathToCard(cardkey))
            : Export.project.cardrootFolder;
        const cards: card[] = [];

        // If doing a partial tree export, put the parent information as it would have already been gathered.
        if (cardkey) {
            cards.push({
                key: cardkey,
                path: sourcePath
            });
        }

        await super.readCardTreeToMemory(sourcePath, cards);
        if (!cards.length) {
            return { statusCode: 500, message: 'No cards found' };
        }
        if (cards.length > 3000) {
            return { statusCode: 400, message: `There are ${cards.length} cards in the project. Exporting to a site only supports maximum of 3000 cards.` };
        }
        if (cards.length > 1000 && cards.length < 3000) {
            console.warn(`Warning: There are ${cards.length} cards in the project. There is a hard limit of 3000 cards that can be exported as a site.`);
        }

        return this.export(destination, cards);
    }
}
