import { expect, it, describe } from 'vitest';

import { join, sep } from 'node:path';

import {
  pathToResourceName,
  type ResourceName,
  resourceNameToPath,
  resourceName,
  resourceNameToString,
  resourceFilePath,
} from '../../src/utils/resource-utils.js';
import { getTestProject } from '../helpers/test-utils.js';

describe('resource utils', () => {
  describe('resourceName', () => {
    it('validates a valid resource name (success)', () => {
      const name = 'test/test/test';
      // note that resource name util does not handle incorrect prefixes, or types
      const { identifier, prefix, type } = resourceName(name);
      expect(prefix).toBe('test');
      expect(type).toBe('test');
      expect(identifier).toBe('test');
    });
    it('validates a valid identifier (success)', () => {
      const name = 'test';
      const { identifier, prefix, type } = resourceName(name);
      expect(prefix).toBe('');
      expect(type).toBe('');
      expect(identifier).toBe('test');
    });
    it('throws an error when doing strict identifier validation', () => {
      const name = 'test';
      const strictNameValidation = true;
      expect(() => resourceName(name, strictNameValidation)).toThrow(
        "Name 'test' is not valid resource name",
      );
    });
    it.each(['', 'test/test', 'test/test/test/test'])(
      'throws when resource name is invalid - %s',
      (invalidName) => {
        expect(() => resourceName(invalidName)).toThrow();
      },
    );
  });
  describe('resourceNameToString', () => {
    it('returns the resource name when provided a valid ResourceName', () => {
      const resourceName: ResourceName = {
        prefix: 'test',
        type: 'test',
        identifier: 'test',
      };
      const stringName = resourceNameToString(resourceName);
      expect(stringName).toBe('test/test/test');
    });
    it('returns the identifies when that is the only resource property defined', () => {
      const resourceName: ResourceName = {
        prefix: '',
        type: '',
        identifier: 'test',
      };
      const stringName = resourceNameToString(resourceName);
      expect(stringName).toBe('test');
    });
    it('returns an empty string when all resource properties are empty', () => {
      const resourceName: ResourceName = {
        prefix: '',
        type: '',
        identifier: '',
      };
      const stringName = resourceNameToString(resourceName);
      expect(stringName).toBe('');
    });
    it.each([
      [{ prefix: 'a', type: '', identifier: 'a' }],
      [{ prefix: 'a', type: '', identifier: '' }],
      [{ prefix: '', type: 'a', identifier: '' }],
      [{ prefix: '', type: 'a', identifier: 'a' }],
    ])('throws an error when resources have invalid values', (resourceName) => {
      expect(() => {
        resourceNameToString(resourceName);
      }).toThrow();
    });
  });
});

describe('resource utils with Project instance', async () => {
  const baseDir = import.meta.dirname;
  const decisionRecordsPath = join(
    baseDir,
    '../test-data/valid/decision-records',
  );
  const project = getTestProject(decisionRecordsPath);
  await project.populateCaches();

  describe('resourceNameToPath', () => {
    it.each([
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
    ])('converts the resource name to path', (resourceName, expectedPath) => {
      const resultPath = resourceNameToPath(project, resourceName);
      expect(resultPath).toBe(expectedPath);
    });
    it('converts ResourceName to path with a custom extension', () => {
      const resultPath = resourceNameToPath(
        project,
        {
          prefix: project.projectPrefix,
          type: 'calculations',
          identifier: 'test',
        },
        '.lp',
      );
      expect(resultPath).toBe(
        `${project.paths.resourcesFolder}${sep}calculations${sep}test.lp`,
      );
    });
    it('throws an error if ResourceName has an empty prefix', () => {
      expect(() =>
        resourceNameToPath(project, {
          prefix: '',
          type: '',
          identifier: '',
        }),
      ).toThrow('resourceName does not contain prefix');
    });
  });

  describe('pathToResourceName', () => {
    it.each([
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
    ])('converts path to ResourceName', (path, expectedResourceName) => {
      const resourceName = pathToResourceName(project, path);
      expect(resourceName.prefix).toBe(expectedResourceName.prefix);
      expect(resourceName.type).toBe(expectedResourceName.type);
      expect(resourceName.identifier).toBe(expectedResourceName.identifier);
    });

    it.each([
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
    ])('throws an error when path is invalid', (path, expectedErrorMessage) => {
      expect(() => pathToResourceName(project, path)).toThrow(
        `${expectedErrorMessage} ${path}`,
      );
    });
  });

  describe('resourceFilePath', () => {
    const extension = 'fileName.extension';
    it.each([
      [
        `${project.paths.resourcesFolder}${sep}type${sep}identifier${sep}${extension}`,
        {
          prefix: project.projectPrefix,
          type: 'type',
          identifier: 'identifier',
        },
      ],
      [
        `${project.paths.modulesFolder}${sep}base${sep}type${sep}identifier${sep}${extension}`,
        {
          prefix: 'base',
          type: 'type',
          identifier: 'identifier',
        },
      ],
    ])(
      'handles the file path correctly when an extension is provided',
      (expectedPath, resourceName) => {
        const filePath = resourceFilePath(project, resourceName, extension);
        expect(filePath).toBe(expectedPath);
      },
    );
  });
});
