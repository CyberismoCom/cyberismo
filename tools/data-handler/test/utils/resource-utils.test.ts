// testing
import { expect } from 'chai';
import { describe, it } from 'mocha';

// node
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  pathToResourceName,
  ResourceName,
  resourceNameToPath,
  resourceName,
  resourceNameToString,
  resourceObjectToResource,
  resourceObjectToResourceName,
} from '../../src/utils/resource-utils.js';

import { Project } from '../../src/containers/project.js';
import { WorkflowResource } from '../../src/resources/workflow-resource.js';

describe('resource utils', () => {
  it('resourceName with valid resource name (success)', () => {
    const name = 'test/test/test';
    // note that resource name util does not handle incorrect prefixes, or types
    const { identifier, prefix, type } = resourceName(name);
    expect(prefix).to.equal('test');
    expect(type).to.equal('test');
    expect(identifier).to.equal('test');
  });
  it('resourceName with valid identifier (success)', () => {
    const name = 'test';
    const { identifier, prefix, type } = resourceName(name);
    expect(prefix).to.equal('');
    expect(type).to.equal('');
    expect(identifier).to.equal('test');
  });
  it('resourceName with invalid names', () => {
    const invalidResourceNames = ['', 'test/test', 'test/test/test/test'];
    for (const invalidName of invalidResourceNames) {
      expect(() => {
        resourceName(invalidName);
      }).to.throw();
    }
  });
  it('resourceNameToString with valid resource name', () => {
    const resourceName: ResourceName = {
      prefix: 'test',
      type: 'test',
      identifier: 'test',
    };
    const stringName = resourceNameToString(resourceName);
    expect(stringName).to.equal('test/test/test');
  });
  it('resourceNameToString with valid identifier', () => {
    const resourceName: ResourceName = {
      prefix: '',
      type: '',
      identifier: 'test',
    };
    const stringName = resourceNameToString(resourceName);
    expect(stringName).to.equal('test');
  });
  it('resourceNameToString with empty string', () => {
    const resourceName: ResourceName = {
      prefix: '',
      type: '',
      identifier: '',
    };
    const stringName = resourceNameToString(resourceName);
    expect(stringName).to.equal('');
  });
  it('resourceNameToString with invalid values', () => {
    const invalidResourceNames: ResourceName[] = [
      { prefix: 'a', type: '', identifier: 'a' },
      { prefix: 'a', type: '', identifier: '' },
      { prefix: '', type: 'a', identifier: '' },
      { prefix: '', type: 'a', identifier: 'a' },
    ];
    for (const invalidName of invalidResourceNames) {
      expect(() => {
        resourceNameToString(invalidName);
      }).to.throw();
    }
  });
});

describe('resource utils with Project instance', () => {
  let project: Project;
  before(() => {
    const baseDir = dirname(fileURLToPath(import.meta.url));
    const decisionRecordsPath = join(
      baseDir,
      '../test-data/valid/decision-records',
    );
    // uses the actual test data (not a copy); do not change it in tests.
    project = new Project(decisionRecordsPath);
  });
  it('resourceNameToPath with valid values', () => {
    const validNames: Map<ResourceName, string> = new Map([
      [
        {
          prefix: project.projectPrefix,
          type: 'cardTypes',
          identifier: 'test',
        },
        `${project.paths.resourcesFolder}${sep}cardTypes${sep}test.json`,
      ],
      [
        {
          prefix: project.projectPrefix,
          type: 'workflows',
          identifier: 'decision',
        },
        `${project.paths.resourcesFolder}${sep}workflows${sep}decision.json`,
      ],
    ]);

    for (const name of validNames) {
      const resultPath = resourceNameToPath(project, name[0]);
      expect(resultPath).to.equal(name[1]);
    }
  });
  it('resourceNameToPath with empty prefix throws', () => {
    try {
      resourceNameToPath(project, {
        prefix: '',
        type: '',
        identifier: '',
      });
    } catch (e) {
      if (e instanceof Error)
        expect(e.message).to.equal('resourceName does not contain prefix');
    }
  });

  it('pathToResourceName with valid values', () => {
    const validNames: Map<string, ResourceName> = new Map([
      [
        `${project.paths.resourcesFolder}${sep}cardTypes${sep}test.json`,
        {
          prefix: project.projectPrefix,
          type: 'cardTypes',
          identifier: 'test',
        },
      ],
      [
        `${project.paths.resourcesFolder}${sep}workflows${sep}decision.json`,
        {
          prefix: project.projectPrefix,
          type: 'workflows',
          identifier: 'decision',
        },
      ],
      [
        `${project.paths.modulesFolder}${sep}base${sep}workflows${sep}decision.json`,
        {
          prefix: 'base',
          type: 'workflows',
          identifier: 'decision',
        },
      ],
    ]);
    for (const name of validNames) {
      const resourceName = pathToResourceName(project, name[0]);
      expect(resourceName.prefix).to.equal(name[1].prefix);
      expect(resourceName.type).to.equal(name[1].type);
      expect(resourceName.identifier).to.equal(name[1].identifier);
    }
  });
  it('pathToResourceName with invalid values', () => {
    const validNames: Map<string, ResourceName> = new Map([
      [
        `${project.paths.resourcesFolder}${sep}cardTypes${sep}`,
        {
          prefix: project.projectPrefix,
          type: 'cardTypes',
          identifier: 'test',
        },
      ],
      [
        `${sep}path${sep}to${sep}somewhere${sep}that${sep}is${sep}not${sep}a${sep}project${sep}path`,
        {
          prefix: project.projectPrefix,
          type: 'workflows',
          identifier: 'decision',
        },
      ],
      [
        `${project.paths.resourcesFolder}${sep}base${sep}workflows${sep}decision.json`,
        {
          prefix: 'base',
          type: 'workflows',
          identifier: 'decision',
        },
      ],
    ]);
    for (const name of validNames) {
      try {
        pathToResourceName(project, name[0]);
      } catch (e) {
        if (e instanceof Error) {
          expect(e.message).to.contain(`invalid path`);
          expect(e.message).to.contain(`${name[0]}`);
        }
      }
    }
  });
  it('resourceObjectToResource with valid values', () => {
    const resourceFullName = 'decision/workflows/decision';
    const workflow = new WorkflowResource(
      project,
      resourceName(resourceFullName),
    );
    const resource = resourceObjectToResource(workflow);
    expect(resource.name).to.equal(resourceFullName);
    expect(resource.path).to.equal(
      `${project.paths.resourcesFolder}${sep}workflows`,
    );
  });
  it('resourceObjectToResourceName with valid values', () => {
    const resourceFullName = 'decision/workflows/decision';
    const workflow = new WorkflowResource(
      project,
      resourceName(resourceFullName),
    );
    const name = resourceObjectToResourceName(workflow);
    expect(name.prefix).to.equal('decision');
    expect(name.type).to.equal('workflows');
    expect(name.identifier).to.equal('decision');
  });
});
