// node
import { readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// testing
import { expect } from 'chai';
import { describe, it } from 'mocha';

// data-handler
import { readJsonFile } from '../src/utils/json.js';
import { Validate } from '../src/validate.js';
import { Project } from '../src/containers/project.js';
import { errorFunction } from '../src/utils/log-utils.js';

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
  it('try to validate() - no-.schema-in-card-root', async () => {
    const path = 'test/test-data/invalid/o-.schema-in-cardRoot';
    const valid = await validateCmd.validate(path);
    expect(valid.length).to.be.greaterThan(0);
  });
  it('try to validate() - invalid-empty', async () => {
    const path = 'test/test-data/invalid/invalid-empty';
    const valid = await validateCmd.validate(path);
    expect(valid.length).to.be.greaterThan(0);
  });
  it('try to validate() - missing-card-root', async () => {
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
    const schemaId = 'cardsconfig-schema';
    const jsonSchema = (await readJsonFile(path)) as object;
    const valid = validateCmd.validateJson(jsonSchema, schemaId);
    expect(valid.length).to.equal(0);
  });
  it('validateJson() - card type', async () => {
    const path =
      'test/test-data/valid/decision-records/.cards/local/cardTypes/decision.json';
    const schemaId = '/cardtype-schema';
    const jsonSchema = (await readJsonFile(path)) as object;
    const valid = validateCmd.validateJson(jsonSchema, schemaId);
    expect(valid.length).to.equal(0);
  });
  it('validateJson() - template', async () => {
    const path =
      'test/test-data/valid/decision-records/.cards/local/templates/decision/template.json';
    const schemaId = 'template-schema';
    const jsonSchema = (await readJsonFile(path)) as object;
    const valid = validateCmd.validateJson(jsonSchema, schemaId);
    expect(valid.length).to.equal(0);
  });
  it('validateJson() - workflow', async () => {
    const path =
      'test/test-data/valid/decision-records/.cards/local/workflows/decision.json';
    const schemaId = 'workflow-schema';
    const jsonSchema = (await readJsonFile(path)) as object;
    const valid = validateCmd.validateJson(jsonSchema, schemaId);
    expect(valid.length).to.equal(0);
  });
  it('try to validateJson() - invalid JSON', () => {
    const schemaId = 'workflow-schema';
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
    const schemaId = 'cardsconfig-schema';
    const valid = await validateCmd.validateSchema(path, schemaId);
    expect(valid.length).to.equal(0);
  });
  it('validateSchema() - card type', async () => {
    const path =
      'test/test-data/valid/decision-records/.cards/local/cardTypes/decision.json';
    const schemaId = '/cardtype-schema';
    const valid = await validateCmd.validateSchema(path, schemaId);
    expect(valid.length).to.equal(0);
  });
  it('validateSchema() - template', async () => {
    const path =
      'test/test-data/valid/decision-records/.cards/local/templates/decision/template.json';
    const schemaId = 'template-schema';
    const valid = await validateCmd.validateSchema(path, schemaId);
    expect(valid.length).to.equal(0);
  });
  it('validateSchema() - workflow', async () => {
    const path =
      'test/test-data/valid/decision-records/.cards/local/workflows/decision.json';
    const schemaId = 'workflow-schema';
    const valid = await validateCmd.validateSchema(path, schemaId);
    expect(valid.length).to.equal(0);
  });
  it('try to validateSchema() - invalid JSON', async () => {
    const schemaId = 'workflow-schema';
    await validateCmd
      .validateSchema('', schemaId)
      .catch((error) =>
        expect(errorFunction(error)).to.equal('Path is not valid '),
      );
  });
  it('try to validateSchema() - invalid schemaId', async () => {
    const path =
      'test/test-data/valid/decision-records/.cards/local/workflows/decision.json';
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
      .map((dirent) => join(dirent.path, dirent.name));
    for (const projectPath of invalidProjects) {
      const result = await validateCmd.validate(projectPath);
      expect(result).to.not.equal(undefined); // all of the invalid projects have validation errors
    }
  });
  // @todo add more tests that test various values types can have (correct and incorrect)
});
