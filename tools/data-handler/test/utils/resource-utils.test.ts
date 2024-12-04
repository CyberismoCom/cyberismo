// testing
import { expect } from 'chai';
import { describe, it } from 'mocha';

import {
  ResourceName,
  resourceNameParts,
  resourceNameToString,
} from '../../src/utils/resource-utils.js';

describe('resource utils', () => {
  it('resourceNameParts with valid resource name (success)', () => {
    const resourceName = 'test/test/test';
    // note that resource name util does not handle incorrect prefixes, or types
    const { identifier, prefix, type } = resourceNameParts(resourceName);
    expect(prefix).to.equal('test');
    expect(type).to.equal('test');
    expect(identifier).to.equal('test');
  });
  it('resourceNameParts with valid identifier (success)', () => {
    const resourceName = 'test';
    const { identifier, prefix, type } = resourceNameParts(resourceName);
    expect(prefix).to.equal('');
    expect(type).to.equal('');
    expect(identifier).to.equal('test');
  });
  it('resourceNameParts with invalid names', () => {
    const invalidResourceNames = ['', 'test/test', 'test/test/test/test'];
    for (const invalidName of invalidResourceNames) {
      expect(() => {
        resourceNameParts(invalidName);
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
      console.error(invalidName);
      expect(() => {
        resourceNameToString(invalidName);
      }).to.throw();
    }
  });
});
