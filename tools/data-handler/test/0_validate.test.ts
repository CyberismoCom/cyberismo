// node
import { readdir } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// testing
import { expect } from 'chai';
import { describe, it } from 'mocha';

// data-handler
import { readJsonFile } from '../src/utils/json.js';
import { Validate } from '../src/commands/index.js';
import { Project } from '../src/containers/project.js';
import { errorFunction } from '../src/utils/log-utils.js';
import type { ResourceTypes } from '../src/interfaces/project-interfaces.js';

describe('validate cmd tests', () => {
  const baseDir = dirname(fileURLToPath(import.meta.url));
  const testDir = join(baseDir, 'test-data');
  const validateCmd = Validate.getInstance();

  it('validate() - decision-records (success)', async () => {
    const path = join(testDir, 'valid/decision-records');
    const valid = await validateCmd.validate(path);
    expect(valid.length).to.equal(0);
  });
  it('validate() - minimal (success)', async () => {
    const path = join(testDir, 'valid/minimal');
    const valid = await validateCmd.validate(path);
    expect(valid.length).to.equal(0);
  });
  it('try to validate() - invalid-cardsConfig.json', async () => {
    const path = join(testDir, 'invalid/invalid-cardsConfig.json');
    const valid = await validateCmd.validate(path);
    expect(valid.length).to.be.greaterThan(0);
  });
  it('try to validate() - missing-.cards-subfolders', async () => {
    const path = join(testDir, 'invalid/missing-.cards-subfolders');
    const valid = await validateCmd.validate(path);
    expect(valid.length).to.be.greaterThan(0);
  });
  it('try to validate() - missing-cardsConfig.json', async () => {
    const path = 'test/test-data/invalid/missing-cardsConfig.json';
    const valid = await validateCmd.validate(path);
    expect(valid.length).to.be.greaterThan(0);
  });
  it('try to validate() - missing-cardTypes-subfolder', async () => {
    const path = 'test/test-data/invalid/missing-cardTypes-subfolder';
    const valid = await validateCmd.validate(path);
    expect(valid.length).to.be.greaterThan(0);
  });
  it('try to validate() - missing-templates-subfolder', async () => {
    const path = 'test/test-data/invalid/missing-templates-subfolder';
    const valid = await validateCmd.validate(path);
    expect(valid.length).to.be.greaterThan(0);
  });
  it('try to validate() - missing-workflows-subfolder', async () => {
    const path = 'test/test-data/invalid/missing-workflows-subfolder';
    const valid = await validateCmd.validate(path);
    expect(valid.length).to.be.greaterThan(0);
  });
  it('try to validate() - no-.schema-in.cards', async () => {
    const path = 'test/test-data/invalid/no-.schema-in.cards';
    const valid = await validateCmd.validate(path);
    expect(valid.length).to.be.greaterThan(0);
  });
  it('try to validate() - no-.schema-in.cards-cardTypes', async () => {
    const path = 'test/test-data/invalid/no-.schema-in.cards-cardTypes';
    const valid = await validateCmd.validate(path);
    expect(valid.length).to.be.greaterThan(0);
  });
  it('try to validate() - no-.schema-in.cards-templates', async () => {
    const path = 'test/test-data/invalid/no-.schema-in.cards-templates';
    const valid = await validateCmd.validate(path);
    expect(valid.length).to.be.greaterThan(0);
  });
  it('try to validate() - no-.schema-in.cards-workflows', async () => {
    const path = 'test/test-data/invalid/no-.schema-in.cards-workflows';
    const valid = await validateCmd.validate(path);
    expect(valid.length).to.be.greaterThan(0);
  });
  it('try to validate() - no-.schema-in-cardRoot', async () => {
    const path = 'test/test-data/invalid/o-.schema-in-cardRoot';
    const valid = await validateCmd.validate(path);
    expect(valid.length).to.be.greaterThan(0);
  });
  it('try to validate() - invalid-empty', async () => {
    const path = 'test/test-data/invalid/invalid-empty';
    const valid = await validateCmd.validate(path);
    expect(valid.length).to.be.greaterThan(0);
  });
  it('try to validate() - missing-cardRoot', async () => {
    const path = 'test/test-data/invalid/missing-cardRoot';
    const valid = await validateCmd.validate(path);
    expect(valid.length).to.be.greaterThan(0);
  });
  it('try to validate() - missing-.cards', async () => {
    const path = 'test/test-data/invalid/missing-.cards';
    const valid = await validateCmd.validate(path);
    expect(valid.length).to.be.greaterThan(0);
  });
  it('try to validate() - path does not exist', async () => {
    const path = 'i-do-not-exist';
    const valid = await validateCmd.validate(path);
    expect(valid.length).to.be.greaterThan(0);
  });
  it('validateJson() - cardsConfig', async () => {
    const path =
      'test/test-data/valid/decision-records/.cards/local/cardsConfig.json';
    const schemaId = 'cardsConfigSchema';
    const jsonSchema = (await readJsonFile(path)) as object;
    const valid = validateCmd.validateJson(jsonSchema, schemaId);
    expect(valid.length).to.equal(0);
  });
  it('validateJson() - card type', async () => {
    const path =
      'test/test-data/valid/decision-records/.cards/local/cardTypes/decision.json';
    const schemaId = 'cardTypeSchema';
    const jsonSchema = (await readJsonFile(path)) as object;
    const valid = validateCmd.validateJson(jsonSchema, schemaId);
    expect(valid.length).to.equal(0);
  });
  it('validateJson() - template', async () => {
    const path =
      'test/test-data/valid/decision-records/.cards/local/templates/decision.json';
    const schemaId = 'templateSchema';
    const jsonSchema = (await readJsonFile(path)) as object;
    const valid = validateCmd.validateJson(jsonSchema, schemaId);
    expect(valid.length).to.equal(0);
  });
  it('validateJson() - workflow', async () => {
    const path =
      'test/test-data/valid/decision-records/.cards/local/workflows/decision.json';
    const schemaId = 'workflowSchema';
    const jsonSchema = (await readJsonFile(path)) as object;
    const valid = validateCmd.validateJson(jsonSchema, schemaId);
    expect(valid.length).to.equal(0);
  });
  it('try to validateJson() - invalid JSON', () => {
    const schemaId = 'workflowSchema';
    const valid = validateCmd.validateJson({}, schemaId);
    expect(valid.length).to.be.greaterThan(0);
  });
  it('try to validateJson() - invalid schemaId', async () => {
    const path =
      'test/test-data/valid/decision-records/.cards/local/workflows/decision.json';
    const schemaId = 'i-do-not-exists';
    const jsonSchema = (await readJsonFile(path)) as object;
    const valid = validateCmd.validateJson(jsonSchema, schemaId);
    expect(valid.length).to.be.greaterThan(0);
  });
  it('validateSchema() - cardsConfig', async () => {
    const path =
      'test/test-data/valid/decision-records/.cards/local/cardsConfig.json';
    const schemaId = 'cardsConfigSchema';
    const valid = await validateCmd.validateSchema(path, schemaId);
    expect(valid.length).to.equal(0);
  });
  it('validateSchema() - card type', async () => {
    const path =
      'test/test-data/valid/decision-records/.cards/local/cardTypes/decision.json';
    const schemaId = 'cardTypeSchema';
    const valid = await validateCmd.validateSchema(path, schemaId);
    expect(valid.length).to.equal(0);
  });
  it('validateSchema() - template', async () => {
    const path =
      'test/test-data/valid/decision-records/.cards/local/templates/decision.json';
    const schemaId = 'templateSchema';
    const valid = await validateCmd.validateSchema(path, schemaId);
    expect(valid.length).to.equal(0);
  });
  it('validateSchema() - workflow', async () => {
    const path =
      'test/test-data/valid/decision-records/.cards/local/workflows/decision.json';
    const schemaId = 'workflowSchema';
    const valid = await validateCmd.validateSchema(path, schemaId);
    expect(valid.length).to.equal(0);
  });
  it('try to validateSchema() - invalid JSON', async () => {
    const schemaId = 'workflowSchema';
    await validateCmd
      .validateSchema('', schemaId)
      .catch((error) =>
        expect(errorFunction(error)).to.equal('Path is not valid '),
      );
  });
  it('try to validateSchema() - invalid schemaId', async () => {
    const path =
      'test/test-data/valid/decision-records/.cards/local/workflows/decision';
    const schemaId = 'i-do-not-exists';
    await validateCmd
      .validateSchema(path, schemaId)
      .catch((error) =>
        expect(errorFunction(error)).to.equal(
          "Unknown schema 'i-do-not-exists'",
        ),
      );
  });

  it('validateWorkflowState (success)', async () => {
    const project = new Project('test/test-data/valid/decision-records/');
    const card = await project.findSpecificCard('decision_5', {
      metadata: true,
    });
    if (card) {
      const valid = await validateCmd.validateWorkflowState(project, card);
      expect(valid.length).to.equal(0);
    }
  });
  it('try to validateWorkflowState - invalid state', async () => {
    const project = new Project(
      'test/test-data/invalid/invalid-card-has-wrong-state/',
    );
    const card = await project.findSpecificCard('decision_6', {
      metadata: true,
    });
    if (card) {
      const valid = await validateCmd.validateWorkflowState(project, card);
      expect(valid.length).to.be.greaterThan(0);
    }
  });
  it('try to validateWorkflowState - card type not found', async () => {
    const project = new Project(
      'test/test-data/invalid/invalid-card-has-wrong-state/',
    );
    const card = await project.findSpecificCard('decision_5', {
      metadata: true,
    });
    if (card) {
      const valid = await validateCmd.validateWorkflowState(project, card);
      expect(valid.length).to.be.greaterThan(0);
    }
  });
  it('try to validateWorkflowState - workflow not found from project', async () => {
    const project = new Project(
      'test/test-data/invalid/invalid-card-has-wrong-state/',
    );
    const card = await project.findSpecificCard('decision_7', {
      metadata: true,
    });
    if (card) {
      const valid = await validateCmd.validateWorkflowState(project, card);
      expect(valid.length).to.be.greaterThan(0);
    }
  });
  it('try to validateWorkflowState - workflow not found from card', async () => {
    const project = new Project(
      'test/test-data/invalid/invalid-card-has-wrong-state/',
    );
    const card = await project.findSpecificCard('decision_8', {
      metadata: true,
    });
    if (card) {
      const valid = await validateCmd.validateWorkflowState(project, card);
      expect(valid.length).to.be.greaterThan(0);
    }
  });
  it('validate card custom fields data (success)', async () => {
    const project = new Project('test/test-data/valid/decision-records/');
    // card _6 has all of the types as custom fields (with null values)
    const card = await project.findSpecificCard('decision_6', {
      metadata: true,
    });
    if (card) {
      const valid = await validateCmd.validateCustomFields(project, card);
      expect(valid.length).to.equal(0);
    }
  });
  it('try to validate card custom fields - card type not found', async () => {
    const project = new Project(
      'test/test-data/invalid/invalid-card-has-wrong-state/',
    );
    const card = await project.findSpecificCard('decision_5', {
      metadata: true,
    });
    if (card) {
      const valid = await validateCmd.validateCustomFields(project, card);
      expect(valid.length).to.be.greaterThan(0);
    }
  });
  it('try to validate card custom fields - no metadata for the card', async () => {
    const project = new Project('test/test-data/valid/decision-records/');
    const card = await project.findSpecificCard('decision_5', {
      metadata: false,
    });
    if (card) {
      await validateCmd
        .validateCustomFields(project, card)
        .catch((error) =>
          expect(errorFunction(error)).to.equal(
            "Card 'decision_5' has no metadata. Card object needs to be instantiated with '{metadata: true}'",
          ),
        );
    }
  });
  it('try to validate invalid projects', async () => {
    const pathToInvalidProject = resolve('test/test-data/invalid');
    const invalidProjects = (
      await readdir(pathToInvalidProject, { withFileTypes: true })
    )
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => join(dirent.parentPath, dirent.name));
    for (const projectPath of invalidProjects) {
      const result = await validateCmd.validate(projectPath);
      expect(result).to.not.equal(undefined); // all of the invalid projects have validation errors
    }
  });
  it('try to validate resource that has name conflicts with filename', async () => {
    const project = new Project(
      'test/test-data/invalid/invalid-wrong-resource-names/',
    );
    const errors = await validateCmd.validate(project.basePath);
    const separatedErrors = errors.split('\n');
    const expectWrongPrefix1 =
      "Wrong prefix in resource 'wrong/templates/decision'. Project prefixes are '[decision]'";
    const expectWrongPrefix2 =
      "Wrong prefix in resource 'wrong/cardTypesWrong/decisionWrong'. Project prefixes are '[decision]'";
    const expectWrongName = `Resource 'name' wrong/cardTypesWrong/decisionWrong mismatch with file path 'test${sep}test-data${sep}invalid${sep}invalid-wrong-resource-names${sep}.cards${sep}local${sep}cardTypes${sep}decision.json'`;
    const expectWrongType = `Wrong type name in resource 'wrong/cardTypesWrong/decisionWrong'. Should match filename path: 'test${sep}test-data${sep}invalid${sep}invalid-wrong-resource-names${sep}.cards${sep}local${sep}cardTypes${sep}decision.json'`;
    expect(separatedErrors[0]).to.equal(expectWrongPrefix1);
    expect(separatedErrors[1]).to.equal(expectWrongPrefix2);
    expect(separatedErrors[2]).to.equal(expectWrongName);
    expect(separatedErrors[3]).to.equal(expectWrongType);
  });

  it('validate that identifier follows naming rules', async () => {
    const validNames: string[] = [
      'test',
      'test-too',
      'test_too',
      'test too',
      'test.too',
      'Test',
      'TEST',
      '_test',
      '-test',
      'test111',
      'test-222',
      '2',
      'very-long-but-still-marvelously-valid-resource-name.that_canBe-used-as-a-resource-name',
    ];
    const invalidNames: string[] = [
      '',
      'testÄ',
      'test+too',
      'test*',
      'test$',
      'lpt1',
      'prn',
      'aux',
    ];
    for (const name of validNames) {
      const valid = Validate.isValidIdentifierName(name);
      expect(valid).to.equal(true);
    }
    for (const name of invalidNames) {
      const invalid = Validate.isValidIdentifierName(name);
      expect(invalid).to.equal(false);
    }
  });
  it('validate that folder name follows naming rules', async () => {
    const validNames: string[] = [
      'test',
      'test_too',
      'test.too',
      'Test',
      'TEST',
      '~/test',
      '../test',
      '.test',
      'very-long-but-still-marvelously-valid-folder-name.that_canBe-used',
    ];
    const invalidNames: string[] = ['', '.', '..', 'prn', 'aux'];
    for (const name of validNames) {
      const valid = Validate.validateFolder(name);
      expect(valid).to.equal(true);
    }
    for (const name of invalidNames) {
      const invalid = Validate.validateFolder(name);
      expect(invalid).to.equal(false);
    }
  });
  it('validate project names', async () => {
    const validNames: string[] = [
      'test',
      'test-too',
      'test_too',
      'test too',
      'test.too',
      'Test',
      'TEST',
      '_test',
      '-test',
      'a'.repeat(63),
    ];
    const invalidNames: string[] = [
      '',
      'test2',
      '2',
      'test+too',
      'test*',
      'test$',
      'lpt1',
      'prn',
      'aux',
      'a'.repeat(65),
    ];
    for (const name of validNames) {
      const valid = Validate.isValidProjectName(name);
      expect(valid).to.equal(true);
    }
    for (const name of invalidNames) {
      const invalid = Validate.isValidProjectName(name);
      expect(invalid).to.equal(false);
    }
  });
  it('validate label names', async () => {
    const validNames: string[] = [
      'test',
      'test-too',
      'test_too',
      'test too',
      'test.too',
      'Test',
      'TEST',
      '_test',
      '-test',
      'very-long-but-still-marvelously-valid-resource-name.that_canBe-used-as-a-resource-name',
      'test2',
      '2',
    ];
    const invalidNames: string[] = ['', ' test2', '(test)', '2'.repeat(500)];
    for (const name of validNames) {
      const valid = Validate.isValidLabelName(name);
      expect(valid).to.equal(true);
    }
    for (const name of invalidNames) {
      const invalid = Validate.isValidLabelName(name);
      expect(invalid).to.equal(false);
    }
  });
  it('validate resource names', async () => {
    const project = new Project('test/test-data/valid/decision-records');
    const prefixes = await project.projectPrefixes();
    const projectPrefix = project.projectPrefix;
    const validResources: Map<ResourceTypes, string> = new Map([
      ['cardTypes', `${projectPrefix}/cardTypes/test`],
      ['fieldTypes', `${projectPrefix}/fieldTypes/test`],
      ['linkTypes', `${projectPrefix}/linkTypes/test`],
      ['reports', `${projectPrefix}/reports/test`],
      ['templates', `${projectPrefix}/templates/test`],
      ['workflows', `${projectPrefix}/workflows/test`],
    ]);
    const invalidResources: Map<ResourceTypes, string> = new Map([
      ['cardTypes', `${projectPrefix}/fieldTypes/test`],
      ['fieldTypes', `/fieldTypes/test`],
      ['linkTypes', `${projectPrefix}/linkTypes/`],
      ['reports', `invlid/reports/test`],
      ['templates', `${projectPrefix}/reports/test`],
      ['workflows', `${projectPrefix}/_/test`],
    ]);

    for (const resourceType of validResources) {
      await validateCmd
        .validResourceName(resourceType[0], resourceType[1], prefixes)
        .then(() => {
          expect(true);
        })
        .catch(() => {
          // Valid names should not throw.
          expect(false);
        });
    }
    for (const resourceType of invalidResources) {
      await validateCmd
        .validResourceName(resourceType[0], resourceType[1], prefixes)
        .then(() => {
          // invalid names should throw; fail test if this does not happen.
          expect(false);
        })
        .catch(() => {
          expect(true);
        });
    }
  });
});
