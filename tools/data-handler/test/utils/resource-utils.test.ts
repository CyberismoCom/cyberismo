import { expect } from 'chai';

import { join, sep } from 'node:path';

import {
  pathToResourceName,
  type ResourceName,
  resourceNameToPath,
  resourceName,
  resourceNameToString,
  resourceFilePath,
} from '../../src/utils/resource-utils.js';
import type { Project } from '../../src/containers/project.js';
import { getTestProject } from '../helpers/test-utils.js';

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
  it('resourceName with only identifier and using "strict" throws', () => {
    const name = 'test';
    const strictNameValidation = true;
    expect(() => resourceName(name, strictNameValidation)).to.throw(
      "Name 'test' is not valid resource name",
    );
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
  const baseDir = import.meta.dirname;
  const decisionRecordsPath = join(
    baseDir,
    '../test-data/valid/decision-records',
  );
  let project: Project;
  before(async () => {
    project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
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
  it('resourceNameToPath with custom extension', () => {
    const resultPath = resourceNameToPath(
      project,
      {
        prefix: project.projectPrefix,
        type: 'calculations',
        identifier: 'test',
      },
      '.lp',
    );
    expect(resultPath).to.equal(
      `${project.paths.resourcesFolder}${sep}calculations${sep}test.lp`,
    );
  });
  it('resourceNameToPath with empty prefix throws', () => {
    expect(() =>
      resourceNameToPath(project, {
        prefix: '',
        type: '',
        identifier: '',
      }),
    ).to.throw('resourceName does not contain prefix');
  });

  it('resourceNameToPath with extension', () => {
    const validNames: Map<string, ResourceName> = new Map([
      [
        `${project.paths.resourcesFolder}${sep}test${sep}test.test`,
        {
          prefix: project.projectPrefix,
          type: 'test',
          identifier: 'test',
        },
      ],
      [
        `${project.paths.modulesFolder}${sep}base${sep}test${sep}test.test`,
        {
          prefix: 'base',
          type: 'test',
          identifier: 'test',
        },
      ],
    ]);
    for (const name of validNames) {
      const filePath = resourceNameToPath(project, name[1], '.test');
      expect(filePath).to.equal(name[0]);
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
    const invalidNames: Map<string, string> = new Map([
      [
        `${project.paths.resourcesFolder}${sep}cardTypes${sep}`,
        `invalid path:`,
      ],
      [
        `${sep}path${sep}to${sep}somewhere${sep}that${sep}is${sep}not${sep}a${sep}project${sep}path`,
        `invalid path:`,
      ],
      [
        `${project.paths.resourcesFolder}${sep}base${sep}workflows${sep}decision.json`,
        'not a resource path:',
      ],
    ]);
    for (const name of invalidNames) {
      expect(() => pathToResourceName(project, name[0])).to.throw(
        `${name[1]} ${name[0]}`,
      );
    }
  });

  it('resourceFilePath with extension', () => {
    const validNames: Map<string, ResourceName> = new Map([
      [
        `${project.paths.resourcesFolder}${sep}type${sep}identifier${sep}fileName.extension`,
        {
          prefix: project.projectPrefix,
          type: 'type',
          identifier: 'identifier',
        },
      ],
      [
        `${project.paths.modulesFolder}${sep}base${sep}type${sep}identifier${sep}fileName.extension`,
        {
          prefix: 'base',
          type: 'type',
          identifier: 'identifier',
        },
      ],
    ]);
    for (const name of validNames) {
      const filePath = resourceFilePath(project, name[1], 'fileName.extension');
      expect(filePath).to.equal(name[0]);
    }
  });
});
