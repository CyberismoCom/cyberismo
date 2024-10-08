// testing
import { expect } from 'chai';
import { describe, it } from 'mocha';

import { resourceNameParts } from '../../src/utils/resource-utils.js';

describe('resource utils', () => {
  it('resourceNameParts with valid long resource name (success)', () => {
    const resourceName = 'test/test/test';
    // note that resource name util does not handle incorrect prefixes, or types
    const { prefix, type, name } = resourceNameParts(resourceName);
    expect(prefix).to.equal('test');
    expect(type).to.equal('test');
    expect(name).to.equal('test');
  });
  it('resourceNameParts with valid short resource name (success)', () => {
    const resourceName = 'test';
    const { prefix, type, name } = resourceNameParts(resourceName);
    expect(prefix).to.equal('');
    expect(type).to.equal('');
    expect(name).to.equal('test');
  });
  it('resourceNameParts with invalid names', () => {
    const invalidResourceNames = ['', 'test/test', 'test/test/test/test'];
    for (const invalidName of invalidResourceNames) {
      expect(() => {
        resourceNameParts(invalidName);
      }).to.throw();
    }
  });
});
