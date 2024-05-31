// node
import { join } from 'node:path';

// testing
import { expect } from 'chai';
import { describe, it } from 'mocha';

// ismo
import { readJsonFile } from '../src/utils/json.js';
import { Validate } from '../src/validate.js';

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

describe('validate cmd tests', () => {

    const baseDir = dirname(fileURLToPath(import.meta.url));
    const testDir = join(baseDir, 'test-data');
    const validateCmd = Validate.getInstance();

    it('validate() - decision-records (success)', async () => {
        const path = join(testDir, 'valid/decision-records');
        const status = await validateCmd.validate(path);
        expect(status.statusCode).to.equal(200);
    });
    it('validate() - minimal (success)', async () => {
        const path = join(testDir, 'valid/minimal');
        const status = await validateCmd.validate(path);
        expect(status.statusCode).to.equal(200);
    });
    it('try to validate() - invalid-cardsconfig.json', async () => {
        const path = join(testDir, 'invalid/invalid-cardsconfig.json');
        const status = await validateCmd.validate(path);
        expect(status.statusCode).to.equal(400);
    });
    it('try to validate() - missing-.cards-subfolders', async () => {
        const path = join(testDir, 'invalid/missing-.cards-subfolders');
        const status = await validateCmd.validate(path);
        expect(status.statusCode).to.equal(400);
    });
    it('try to validate() - missing-cardsconfig.json', async () => {
        const path = 'test/test-data/invalid/missing-cardsconfig.json';
        const status = await validateCmd.validate(path);
        expect(status.statusCode).to.equal(400);
    });
    it('try to validate() - missing-cardtypes-subfolder', async () => {
        const path = 'test/test-data/invalid/missing-cardtypes-subfolder';
        const status = await validateCmd.validate(path);
        expect(status.statusCode).to.equal(400);
    });
    it('try to validate() - missing-templates-subfolder', async () => {
        const path = 'test/test-data/invalid/missing-templates-subfolder';
        const status = await validateCmd.validate(path);
        expect(status.statusCode).to.equal(400);
    });
    it('try to validate() - missing-workflows-subfolder', async () => {
        const path = 'test/test-data/invalid/missing-workflows-subfolder';
        const status = await validateCmd.validate(path);
        expect(status.statusCode).to.equal(400);
    });
    it('try to validate() - no-.schema-in.cards', async () => {
        const path = 'test/test-data/invalid/no-.schema-in.cards';
        const status = await validateCmd.validate(path);
        expect(status.statusCode).to.equal(500);
    });
    it('try to validate() - no-.schema-in.cards-cardtypes', async () => {
        const path = 'test/test-data/invalid/no-.schema-in.cards-cardtypes';
        const status = await validateCmd.validate(path);
        expect(status.statusCode).to.equal(500);
    });
    it('try to validate() - no-.schema-in.cards-templates', async () => {
        const path = 'test/test-data/invalid/no-.schema-in.cards-templates';
        const status = await validateCmd.validate(path);
        expect(status.statusCode).to.equal(500);
    });
    it('try to validate() - no-.schema-in.cards-workflows', async () => {
        const path = 'test/test-data/invalid/no-.schema-in.cards-workflows';
        const status = await validateCmd.validate(path);
        expect(status.statusCode).to.equal(500);
    });
    it('try to validate() - no-.schema-in-cardroot', async () => {
        const path = 'test/test-data/invalid/o-.schema-in-cardroot';
        const status = await validateCmd.validate(path);
        expect(status.statusCode).to.equal(500);
    });
    it('try to validate() - invalid-empty', async () => {
        const path = 'test/test-data/invalid/invalid-empty';
        const status = await validateCmd.validate(path);
        expect(status.statusCode).to.equal(500);
    });
    it('try to validate() - missing-cardroot', async () => {
        const path = 'test/test-data/invalid/missing-cardroot';
        const status = await validateCmd.validate(path);
        expect(status.statusCode).to.equal(400);
    });
    it('try to validate() - missing-.cards', async () => {
        const path = 'test/test-data/invalid/missing-.cards';
        const status = await validateCmd.validate(path);
        expect(status.statusCode).to.equal(400);
    });
    it('try to validate() - path does not exist', async () => {
        const path = 'i-do-not-exist';
        const status = await validateCmd.validate(path);
        expect(status.statusCode).to.equal(500);
    });
    it('validateJson() - cardsconfig', async () => {
        const path = 'test/test-data/valid/decision-records/.cards/local/cardsconfig.json';
        const schemaId = 'cardsconfig-schema';
        const jsonSchema = await readJsonFile(path);
        const status = await validateCmd.validateJson(jsonSchema, schemaId);
        expect(status.statusCode).to.equal(200);
    });
    it('validateJson() - cardtype', async () => {
        const path = 'test/test-data/valid/decision-records/.cards/local/cardtypes/decision-cardtype.json';
        const schemaId = '/cardtype-schema';
        const jsonSchema = await readJsonFile(path);
        const status = await validateCmd.validateJson(jsonSchema, schemaId);
        expect(status.statusCode).to.equal(200);
    });
    it('validateJson() - template', async () => {
        const path = 'test/test-data/valid/decision-records/.cards/local/templates/decision/template.json';
        const schemaId = 'template-schema';
        const jsonSchema = await readJsonFile(path);
        const status = await validateCmd.validateJson(jsonSchema, schemaId);
        expect(status.statusCode).to.equal(200);
    });
    it('validateJson() - workflow', async () => {
        const path = 'test/test-data/valid/decision-records/.cards/local/workflows/decision-workflow.json';
        const schemaId = 'workflow-schema';
        const jsonSchema = await readJsonFile(path);
        const status = await validateCmd.validateJson(jsonSchema, schemaId);
        expect(status.statusCode).to.equal(200);
    });
    it('try to validateJson() - invalid JSON', async () => {
        const schemaId = 'workflow-schema';
        const status = await validateCmd.validateJson({}, schemaId);
        expect(status.statusCode).to.equal(400);
    });
    it('try to validateJson() - invalid schemaId', async () => {
        const path = 'test/test-data/valid/decision-records/.cards/local/workflows/decision-workflow.json';
        const schemaId = 'i-do-not-exists';
        const jsonSchema = await readJsonFile(path);
        const status = await validateCmd.validateJson(jsonSchema, schemaId);
        expect(status.statusCode).to.equal(400);
    });
    it('validateSchema() - cardsconfig', async () => {
        const path = 'test/test-data/valid/decision-records/.cards/local/cardsconfig.json';
        const schemaId = 'cardsconfig-schema';
        const status = await validateCmd.validateSchema(path, schemaId);
        expect(status.statusCode).to.equal(200);
    });
    it('validateSchema() - cardtype', async () => {
        const path = 'test/test-data/valid/decision-records/.cards/local/cardtypes/decision-cardtype.json';
        const schemaId = '/cardtype-schema';
        const status = await validateCmd.validateSchema(path, schemaId);
        expect(status.statusCode).to.equal(200);
    });
    it('validateSchema() - template', async () => {
        const path = 'test/test-data/valid/decision-records/.cards/local/templates/decision/template.json';
        const schemaId = 'template-schema';
        const status = await validateCmd.validateSchema(path, schemaId);
        expect(status.statusCode).to.equal(200);
    });
    it('validateSchema() - workflow', async () => {
        const path = 'test/test-data/valid/decision-records/.cards/local/workflows/decision-workflow.json';
        const schemaId = 'workflow-schema';
        const status = await validateCmd.validateSchema(path, schemaId);
        expect(status.statusCode).to.equal(200);
    });
    it('try to validateSchema() - invalid JSON', async () => {
        const schemaId = 'workflow-schema';
        const status = await validateCmd.validateSchema('', schemaId);
        expect(status.statusCode).to.equal(400);
    });
    it('try to validateSchema() - invalid schemaId', async () => {
        const path = 'test/test-data/valid/decision-records/.cards/local/workflows/decision-workflow.json';
        const schemaId = 'i-do-not-exists';
        const status = await validateCmd.validateSchema(path, schemaId);
        expect(status.statusCode).to.equal(400);
    });
})

