import { expect } from 'chai';

import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { Commands } from '../src/command-handler.js';
import { copyDir } from '../src/utils/file-utils.js'
import { ExportSite } from '../src/export-site.js';
import { Project } from '../src/containers/project.js';
import { fileURLToPath } from 'node:url';

const baseDir = dirname(fileURLToPath(import.meta.url));

describe('export-site', () => {
    const testDir = join(baseDir, 'tmp-export-tests');

    before(async () => {
        mkdirSync(testDir, { recursive: true });
        await copyDir('test/test-data/', testDir);
    });

    after(() => {
        rmSync(testDir, { recursive: true, force: true });
    });
    it('export site - initialise', async () => {
        const decisionRecordsPath = join(testDir, 'valid/decision-records');
        const project = new Project(decisionRecordsPath);

        const exportSite = new ExportSite();
        const projectRoot = join(project.cardrootFolder, '..');
        exportSite.exportToSite(projectRoot, "/tmp/foo");
        expect(true).to.equal(true);
    });
});

describe('export command', () => {

    const commandHandler = new Commands();
    const testDirForExport = join(baseDir, 'tmp-command-export-tests');

    const decisionRecordsPath = join(testDirForExport, 'valid/decision-records');
    const minimalPath = join(testDirForExport, 'valid/minimal');
    beforeEach(async () => {
        rmSync(join(decisionRecordsPath, 'output'), { recursive: true, force: true });
        rmSync(join(decisionRecordsPath, 'test/output'), { recursive: true, force: true });
    });
    it('export to HTML (success)', async () => {
        const card = '';
        const mode = 'html';
        const destination = join(testDirForExport, 'output');
        const result = await commandHandler.export(destination, minimalPath, card, mode);
        expect(result.statusCode).to.equal(200);
    });
    it('export partial tree to HTML (success)', async () => {
        const card = 'decision_5';
        const mode = 'html';
        const destination = join(testDirForExport, 'output');
        const result = await commandHandler.export(destination, decisionRecordsPath, card, mode);
        expect(result.message).to.be.equal(undefined);
        expect(result.statusCode).to.equal(200);
    });
    it('invalid format', async () => {
        const card = '';
        const mode = 'wrong';
        const destination = join(testDirForExport, 'output');
        const result = await commandHandler.export(destination, decisionRecordsPath, card, mode);
        expect(result.statusCode).to.equal(400);
    });
    it('missing project', async () => {
        const card = '';
        const mode = 'html';
        const source = 'valid/i-do-not-exist';
        const destination = join(testDirForExport, 'test/output/');
        const result = await commandHandler.export(destination, source, card, mode);
        expect(result.statusCode).to.equal(400);
    });
    it('missing parent card', async () => {
        const card = 'decision_999';
        const mode = 'html';
        const destination = join(testDirForExport, 'test/output/');
        const result = await commandHandler.export(destination, decisionRecordsPath, card, mode);
        expect(result.statusCode).to.equal(400);
    });
    it('inaccessible destination', async () => {
        const card = 'decision_1';
        const mode = 'html';
        const destination = join(testDirForExport, '/i-do-not-exist/output');
        const result = await commandHandler.export(decisionRecordsPath, destination, card, mode);
        expect(result.statusCode).to.equal(400);
    });
});