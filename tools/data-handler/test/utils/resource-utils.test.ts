// testing
import { expect } from 'chai';
import { describe, it } from 'mocha';

import {
  identifierFromResourceName,
  resourceNameParts,
} from '../../src/utils/resource-utils.js';

describe('resource utils', () => {
  it('resourceNameParts with valid long resource name (success)', () => {
    const resourceName = 'test/test/test';
    // note that resource name util does not handle incorrect prefixes, or types
    const { identifier, prefix, type } = resourceNameParts(resourceName);
    expect(prefix).to.equal('test');
    expect(type).to.equal('test');
    expect(identifier).to.equal('test');
  });
  it('resourceNameParts with valid short resource name (success)', () => {
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
  it('normalize resource name', () => {
    const empty = identifierFromResourceName('');
    const localDecision = identifierFromResourceName(
      'local/templates/decision',
    );
    const decision = identifierFromResourceName('decision');
    const invalidName = identifierFromResourceName('more/folders/than/allowed');

    expect(empty).to.equal('');
    expect(localDecision).to.equal('decision');
    expect(decision).to.equal('decision');
    expect(invalidName).to.equal('');
  });
});
